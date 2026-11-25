//! The message loop: what the server announces, and which function answers
//! each message.

use std::error::Error;

use lsp_server::{Connection, ErrorCode, Message, Notification, Request, RequestId, Response};
use lsp_types::{
    DidChangeTextDocumentParams, DidChangeWatchedFilesRegistrationOptions,
    DidCloseTextDocumentParams, DidOpenTextDocumentParams, FileSystemWatcher, GlobPattern,
    GotoDefinitionParams, GotoDefinitionResponse, HoverParams, HoverProviderCapability,
    InitializeParams, InitializeResult, OneOf, PublishDiagnosticsParams, Registration,
    RegistrationParams, SemanticTokens, SemanticTokensFullOptions, SemanticTokensOptions,
    SemanticTokensParams, SemanticTokensServerCapabilities, ServerCapabilities, ServerInfo,
    TextDocumentSyncCapability, TextDocumentSyncKind, TextDocumentSyncOptions,
    TextDocumentSyncSaveOptions, Uri,
};
use serde::Deserialize;
use serde_json::Value;

use crate::workspace::Workspace;
use crate::{features, tokens};

/// What can end the server other than the client asking it to stop.
pub type Failure = Box<dyn Error + Send + Sync>;

/// The files whose changes on disk change what a reference resolves to.
const WATCHED: [&str; 2] = ["**/*.{hmd,md,markdown}", "**/.hmd/config.toml"];

/// The settings a client sends when it starts the server, as the
/// `initializationOptions` of its first request.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(default)]
pub struct Options {
    /// Whether the server publishes diagnostics. A client that has another
    /// source of the same diagnostics turns them off here.
    pub diagnostics: bool,
}

impl Default for Options {
    fn default() -> Self {
        Options { diagnostics: true }
    }
}

/// What the server tells a client it can do.
pub fn capabilities() -> ServerCapabilities {
    ServerCapabilities {
        text_document_sync: Some(TextDocumentSyncCapability::Options(
            TextDocumentSyncOptions {
                open_close: Some(true),
                // The client sends the whole text on every change. A card is
                // small, and the vault is loaded again either way.
                change: Some(TextDocumentSyncKind::FULL),
                save: Some(TextDocumentSyncSaveOptions::Supported(true)),
                ..TextDocumentSyncOptions::default()
            },
        )),
        hover_provider: Some(HoverProviderCapability::Simple(true)),
        definition_provider: Some(OneOf::Left(true)),
        semantic_tokens_provider: Some(SemanticTokensServerCapabilities::SemanticTokensOptions(
            SemanticTokensOptions {
                legend: tokens::legend(),
                full: Some(SemanticTokensFullOptions::Bool(true)),
                ..SemanticTokensOptions::default()
            },
        )),
        ..ServerCapabilities::default()
    }
}

/// Serves one client over `connection` until the client asks it to stop.
pub fn run(connection: &Connection) -> Result<(), Failure> {
    let (id, params) = connection.initialize_start()?;
    let params: InitializeParams = serde_json::from_value(params)?;
    let options = params
        .initialization_options
        .clone()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();
    let result = InitializeResult {
        capabilities: capabilities(),
        server_info: Some(ServerInfo {
            name: env!("CARGO_PKG_NAME").to_owned(),
            version: Some(env!("CARGO_PKG_VERSION").to_owned()),
        }),
    };
    connection.initialize_finish(id, serde_json::to_value(result)?)?;

    let mut server = Server {
        connection,
        options,
        workspace: Workspace::new(),
    };
    if watches_dynamically(&params) {
        server.watch_files()?;
    }
    for message in &connection.receiver {
        match message {
            Message::Request(request) => {
                if connection.handle_shutdown(&request)? {
                    return Ok(());
                }
                server.request(request)?;
            }
            Message::Notification(notification) => server.notification(notification)?,
            // The only request the server sends is the one that registers the
            // file watchers, and nothing depends on its answer.
            Message::Response(_) => {}
        }
    }
    Ok(())
}

/// Whether the client lets a server register file watchers after it starts.
fn watches_dynamically(params: &InitializeParams) -> bool {
    params
        .capabilities
        .workspace
        .as_ref()
        .and_then(|workspace| workspace.did_change_watched_files.as_ref())
        .and_then(|watched| watched.dynamic_registration)
        .unwrap_or(false)
}

/// One client's session.
struct Server<'a> {
    connection: &'a Connection,
    options: Options,
    workspace: Workspace,
}

impl Server<'_> {
    /// Asks the client to report changes to cards and configurations on disk.
    fn watch_files(&self) -> Result<(), Failure> {
        let options = DidChangeWatchedFilesRegistrationOptions {
            watchers: WATCHED
                .into_iter()
                .map(|glob| FileSystemWatcher {
                    glob_pattern: GlobPattern::String(glob.to_owned()),
                    kind: None,
                })
                .collect(),
        };
        let params = RegistrationParams {
            registrations: vec![Registration {
                id: "hmd-lsp.watched-files".to_owned(),
                method: "workspace/didChangeWatchedFiles".to_owned(),
                register_options: Some(serde_json::to_value(options)?),
            }],
        };
        self.send(Message::Request(Request::new(
            RequestId::from("hmd-lsp.register".to_owned()),
            "client/registerCapability".to_owned(),
            params,
        )))
    }

    /// Answers one request.
    fn request(&mut self, request: Request) -> Result<(), Failure> {
        let Request { id, method, params } = request;
        let response = match method.as_str() {
            "textDocument/semanticTokens/full" => self.answer(id, params, Self::semantic_tokens),
            "textDocument/definition" => self.answer(id, params, Self::definition),
            "textDocument/hover" => self.answer(id, params, Self::hover),
            _ => Response::new_err(
                id,
                ErrorCode::MethodNotFound as i32,
                format!("hmd-lsp does not answer {method}"),
            ),
        };
        self.send(Message::Response(response))
    }

    /// Reads the parameters of a request, runs `handler`, and wraps what it
    /// returns as the response.
    fn answer<P, R>(
        &mut self,
        id: RequestId,
        params: Value,
        handler: fn(&mut Self, P) -> R,
    ) -> Response
    where
        P: serde::de::DeserializeOwned,
        R: serde::Serialize,
    {
        match serde_json::from_value(params) {
            Ok(params) => Response::new_ok(id, handler(self, params)),
            Err(err) => Response::new_err(id, ErrorCode::InvalidParams as i32, err.to_string()),
        }
    }

    fn semantic_tokens(&mut self, params: SemanticTokensParams) -> Option<SemanticTokens> {
        let view = self.workspace.view(params.text_document.uri.as_str())?;
        Some(SemanticTokens {
            result_id: None,
            data: tokens::tokens(&view),
        })
    }

    fn definition(&mut self, params: GotoDefinitionParams) -> Option<GotoDefinitionResponse> {
        let at = params.text_document_position_params;
        let view = self.workspace.view(at.text_document.uri.as_str())?;
        Some(GotoDefinitionResponse::Array(features::definition(
            &view,
            at.position,
        )))
    }

    fn hover(&mut self, params: HoverParams) -> Option<lsp_types::Hover> {
        let at = params.text_document_position_params;
        let view = self.workspace.view(at.text_document.uri.as_str())?;
        features::hover(&view, at.position)
    }

    /// Acts on one notification.
    fn notification(&mut self, notification: Notification) -> Result<(), Failure> {
        let Notification { method, params } = notification;
        match method.as_str() {
            "textDocument/didOpen" => {
                let params: DidOpenTextDocumentParams = serde_json::from_value(params)?;
                let document = params.text_document;
                self.workspace.set(document.uri.as_str(), document.text);
                self.publish_all()
            }
            "textDocument/didChange" => {
                let params: DidChangeTextDocumentParams = serde_json::from_value(params)?;
                // The server asks for the whole text, so the last change is
                // the document.
                if let Some(change) = params.content_changes.into_iter().next_back() {
                    self.workspace
                        .set(params.text_document.uri.as_str(), change.text);
                }
                self.publish_all()
            }
            "textDocument/didClose" => {
                let params: DidCloseTextDocumentParams = serde_json::from_value(params)?;
                let uri = params.text_document.uri;
                self.workspace.close(uri.as_str());
                // A closed document keeps no diagnostics in the client.
                if self.options.diagnostics {
                    self.publish(uri, Vec::new())?;
                }
                self.publish_all()
            }
            "textDocument/didSave" | "workspace/didChangeWatchedFiles" => {
                self.workspace.invalidate();
                self.publish_all()
            }
            _ => Ok(()),
        }
    }

    /// Publishes the diagnostics of every open document. A change to one
    /// card can change what a reference in another resolves to.
    fn publish_all(&mut self) -> Result<(), Failure> {
        if !self.options.diagnostics {
            return Ok(());
        }
        for uri in self.workspace.uris() {
            let Some(view) = self.workspace.view(&uri) else {
                continue;
            };
            let diagnostics = features::diagnostics(&view);
            if let Ok(uri) = uri.parse::<Uri>() {
                self.publish(uri, diagnostics)?;
            }
        }
        Ok(())
    }

    /// Sends the diagnostics of one document.
    fn publish(&self, uri: Uri, diagnostics: Vec<lsp_types::Diagnostic>) -> Result<(), Failure> {
        let params = PublishDiagnosticsParams {
            uri,
            diagnostics,
            version: None,
        };
        self.send(Message::Notification(Notification::new(
            "textDocument/publishDiagnostics".to_owned(),
            params,
        )))
    }

    fn send(&self, message: Message) -> Result<(), Failure> {
        self.connection.sender.send(message)?;
        Ok(())
    }
}

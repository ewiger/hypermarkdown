//! What the protocol tests share: a vault on disk, and a client that speaks
//! to a server running in this process.

#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread::JoinHandle;
use std::time::Duration;

use lsp_server::{Connection, Message, Notification, Request, RequestId, ResponseError};
use serde_json::{Value, json};

/// How long a test waits for the server before it fails.
const PATIENCE: Duration = Duration::from_secs(10);

static NEXT_VAULT: AtomicUsize = AtomicUsize::new(0);

/// A directory of cards on disk, removed when the test ends.
pub struct Tree {
    root: PathBuf,
}

impl Tree {
    /// A directory holding `files`, each a path and that file's text. A path
    /// that ends with `/` makes a directory.
    pub fn new(files: &[(&str, &str)]) -> Tree {
        let root = std::env::temp_dir().join(format!(
            "hmd-lsp-test-{}-{}",
            std::process::id(),
            NEXT_VAULT.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let tree = Tree { root };
        for (path, text) in files {
            tree.write(path, text);
        }
        tree
    }

    /// A vault: a directory with the `.hmd` marker, holding `files`.
    pub fn vault(files: &[(&str, &str)]) -> Tree {
        let tree = Tree::new(files);
        tree.write(".hmd/", "");
        tree
    }

    /// Writes the file at `path`, or makes the directory when `path` ends
    /// with `/`.
    pub fn write(&self, path: &str, text: &str) {
        let full = self.path(path);
        if path.ends_with('/') {
            fs::create_dir_all(full).unwrap();
            return;
        }
        fs::create_dir_all(full.parent().unwrap()).unwrap();
        fs::write(full, text).unwrap();
    }

    /// The path on disk of the file at `path`.
    pub fn path(&self, path: &str) -> PathBuf {
        let mut full = self.root.clone();
        full.extend(path.split('/').filter(|part| !part.is_empty()));
        full
    }

    /// The URI of the file at `path`.
    pub fn uri(&self, path: &str) -> String {
        hmd_lsp::uri::from_path(&self.path(path), hmd_lsp::uri::WINDOWS).unwrap()
    }

    /// The directory itself.
    pub fn root(&self) -> &Path {
        &self.root
    }
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

/// A client of a server that runs on another thread of this process.
pub struct Client {
    connection: Connection,
    server: Option<JoinHandle<()>>,
    next_id: i32,
    /// Every notification the server has sent, oldest first.
    pub notifications: Vec<Notification>,
    /// Every request the server has sent, oldest first.
    pub requests: Vec<Request>,
}

impl Client {
    /// Starts a server and completes the handshake with default settings.
    pub fn start() -> Client {
        Client::start_with(Value::Null, json!({}))
    }

    /// Starts a server and completes the handshake, sending `options` as the
    /// initialization options and `capabilities` as the client's
    /// capabilities.
    pub fn start_with(options: Value, capabilities: Value) -> Client {
        let (server, client) = Connection::memory();
        let thread = std::thread::spawn(move || {
            hmd_lsp::server::run(&server).unwrap();
        });
        let mut client = Client {
            connection: client,
            server: Some(thread),
            next_id: 0,
            notifications: Vec::new(),
            requests: Vec::new(),
        };
        client
            .request(
                "initialize",
                json!({
                    "processId": null,
                    "rootUri": null,
                    "capabilities": capabilities,
                    "initializationOptions": options,
                }),
            )
            .unwrap();
        client.notify("initialized", json!({}));
        client
    }

    /// Sends a request and waits for its answer, keeping whatever else the
    /// server sends in the meantime.
    pub fn request(&mut self, method: &str, params: Value) -> Result<Value, ResponseError> {
        self.next_id += 1;
        let id = RequestId::from(self.next_id);
        self.send(Message::Request(Request::new(
            id.clone(),
            method.to_owned(),
            params,
        )));
        loop {
            match self
                .connection
                .receiver
                .recv_timeout(PATIENCE)
                .expect("the server did not answer")
            {
                Message::Response(response) if response.id == id => {
                    return response.response_result;
                }
                Message::Response(response) => panic!("an answer to nothing: {response:?}"),
                Message::Notification(notification) => self.notifications.push(notification),
                Message::Request(request) => self.requests.push(request),
            }
        }
    }

    /// Sends a notification.
    pub fn notify(&mut self, method: &str, params: Value) {
        self.send(Message::Notification(Notification::new(
            method.to_owned(),
            params,
        )));
    }

    /// Waits until the server has handled everything sent so far.
    ///
    /// The server handles messages in order, so the answer to a request
    /// arrives after everything that earlier messages made it send.
    pub fn settle(&mut self) {
        let _ = self.request("test/settle", Value::Null);
    }

    /// Opens the document at `uri` with `text`.
    pub fn open(&mut self, uri: &str, text: &str) {
        self.notify(
            "textDocument/didOpen",
            json!({"textDocument": {
                "uri": uri, "languageId": "hmd", "version": 1, "text": text,
            }}),
        );
    }

    /// Replaces the text of the open document at `uri`.
    pub fn change(&mut self, uri: &str, text: &str) {
        self.notify(
            "textDocument/didChange",
            json!({
                "textDocument": {"uri": uri, "version": 2},
                "contentChanges": [{"text": text}],
            }),
        );
    }

    /// Closes the document at `uri`.
    pub fn close(&mut self, uri: &str) {
        self.notify(
            "textDocument/didClose",
            json!({"textDocument": {"uri": uri}}),
        );
    }

    /// The semantic tokens of the document at `uri`, decoded: each token is
    /// its line, its start, its length, its type and its modifiers.
    pub fn tokens(&mut self, uri: &str) -> Vec<(u64, u64, u64, u64, u64)> {
        let result = self
            .request(
                "textDocument/semanticTokens/full",
                json!({"textDocument": {"uri": uri}}),
            )
            .unwrap();
        let data: Vec<u64> = result["data"]
            .as_array()
            .expect("tokens")
            .iter()
            .map(|number| number.as_u64().unwrap())
            .collect();
        let mut line = 0;
        let mut start = 0;
        data.chunks(5)
            .map(|token| {
                if token[0] > 0 {
                    start = 0;
                }
                line += token[0];
                start += token[1];
                (line, start, token[2], token[3], token[4])
            })
            .collect()
    }

    /// The answer to a request about the position `line`, `character` of the
    /// document at `uri`.
    pub fn at(&mut self, method: &str, uri: &str, line: u32, character: u32) -> Value {
        self.request(
            method,
            json!({
                "textDocument": {"uri": uri},
                "position": {"line": line, "character": character},
            }),
        )
        .unwrap()
    }

    /// The diagnostics the server last published for the document at `uri`,
    /// or `None` when it has published none.
    pub fn diagnostics(&mut self, uri: &str) -> Option<Vec<Value>> {
        self.settle();
        self.notifications
            .iter()
            .rev()
            .find(|notification| {
                notification.method == "textDocument/publishDiagnostics"
                    && notification.params["uri"] == uri
            })
            .map(|notification| {
                notification.params["diagnostics"]
                    .as_array()
                    .unwrap()
                    .clone()
            })
    }

    fn send(&self, message: Message) {
        self.connection.sender.send(message).unwrap();
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        if std::thread::panicking() {
            return;
        }
        self.request("shutdown", Value::Null).unwrap();
        self.notify("exit", Value::Null);
        self.server.take().unwrap().join().unwrap();
    }
}

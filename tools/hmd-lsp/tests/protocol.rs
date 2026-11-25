//! The server, spoken to over the protocol: every test sends the messages an
//! editor sends and reads the answers an editor reads.

mod common;

use common::{Client, Tree};
use hmd_lsp::tokens::{AMBIGUOUS, DISPLAY, EMBED, FRAGMENT, OUTSIDE, PAGE, UNRESOLVED};
use serde_json::{Value, json};

const PAGE_T: u64 = PAGE as u64;
const FRAGMENT_T: u64 = FRAGMENT as u64;
const DISPLAY_T: u64 = DISPLAY as u64;

fn login_vault() -> Tree {
    Tree::vault(&[
        ("shared/tokens.hmd", "# Tokens\n"),
        ("specs/login.hmd", "see [[tokens]]\n"),
    ])
}

#[test]
fn the_server_announces_what_it_answers() {
    let (server, client) = lsp_server::Connection::memory();
    let thread = std::thread::spawn(move || hmd_lsp::server::run(&server).unwrap());
    client
        .sender
        .send(
            lsp_server::Request::new(
                1.into(),
                "initialize".to_owned(),
                json!({"capabilities": {}}),
            )
            .into(),
        )
        .unwrap();
    let lsp_server::Message::Response(response) = client.receiver.recv().unwrap() else {
        panic!("no answer to initialize");
    };
    let result = response.response_result.unwrap();
    assert_eq!(result["serverInfo"]["name"], "hmd-lsp");
    let capabilities = &result["capabilities"];
    assert_eq!(capabilities["hoverProvider"], true);
    assert_eq!(capabilities["definitionProvider"], true);
    assert_eq!(
        capabilities["semanticTokensProvider"]["legend"],
        json!({
            "tokenTypes": ["class", "property", "string"],
            "tokenModifiers": ["unresolved", "ambiguous", "outside", "embed"],
        })
    );
    assert_eq!(capabilities["semanticTokensProvider"]["full"], true);

    for message in [
        lsp_server::Notification::new("initialized".to_owned(), json!({})).into(),
        lsp_server::Request::new(2.into(), "shutdown".to_owned(), Value::Null).into(),
        lsp_server::Notification::new("exit".to_owned(), Value::Null).into(),
    ] {
        let message: lsp_server::Message = message;
        client.sender.send(message).unwrap();
    }
    thread.join().unwrap();
}

#[test]
fn each_part_of_a_reference_is_a_token() {
    let vault = login_vault();
    let uri = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    client.open(
        &uri,
        "see [[tokens#Rotation|how keys rotate]]\n\n![[tokens]]\n",
    );
    assert_eq!(
        client.tokens(&uri),
        [
            (0, 6, 6, PAGE_T, 0),
            (0, 12, 9, FRAGMENT_T, 0),
            (0, 22, 15, DISPLAY_T, 0),
            (2, 3, 6, PAGE_T, EMBED as u64),
        ]
    );
}

#[test]
fn a_reference_that_names_no_card_is_marked() {
    let vault = login_vault();
    let uri = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    client.open(&uri, "[[tokens]] [[nowhere]]\n");
    assert_eq!(
        client.tokens(&uri),
        [(0, 2, 6, PAGE_T, 0), (0, 13, 7, PAGE_T, UNRESOLVED as u64),]
    );
}

#[test]
fn a_reference_that_names_two_cards_is_marked() {
    let vault = Tree::vault(&[
        ("a/tokens.hmd", ""),
        ("b/tokens.hmd", ""),
        ("login.hmd", ""),
    ]);
    let uri = vault.uri("login.hmd");
    let mut client = Client::start();
    client.open(&uri, "[[tokens]]\n");
    assert_eq!(client.tokens(&uri), [(0, 2, 6, PAGE_T, AMBIGUOUS as u64)]);
}

#[test]
fn a_reference_that_leaves_the_namespace_is_marked() {
    let vault = login_vault();
    let uri = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    client.open(&uri, "[[../../elsewhere]]\n");
    assert_eq!(client.tokens(&uri), [(0, 2, 15, PAGE_T, OUTSIDE as u64)]);
}

#[test]
fn a_token_starts_where_the_protocol_counts_it() {
    let vault = login_vault();
    let uri = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    // The emoji is one code point and two UTF-16 units.
    client.open(&uri, "😀 [[tokens]]\n");
    assert_eq!(client.tokens(&uri), [(0, 5, 6, PAGE_T, 0)]);
}

#[test]
fn a_reference_in_code_is_not_a_reference() {
    let vault = login_vault();
    let uri = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    client.open(&uri, "`[[tokens]]`\n\n```\n[[tokens]]\n```\n");
    assert_eq!(client.tokens(&uri), []);
}

#[test]
fn the_text_in_the_editor_wins_over_the_text_on_disk() {
    let vault = login_vault();
    let login = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    // On disk the card links to `tokens`. In the editor it links to a card
    // that exists only as another unsaved document.
    client.open(&login, "[[draft]]\n");
    assert_eq!(
        client.tokens(&login),
        [(0, 2, 5, PAGE_T, UNRESOLVED as u64)]
    );
    client.open(&vault.uri("notes/draft.hmd"), "# Draft\n");
    assert_eq!(client.tokens(&login), [(0, 2, 5, PAGE_T, 0)]);
    client.close(&vault.uri("notes/draft.hmd"));
    assert_eq!(
        client.tokens(&login),
        [(0, 2, 5, PAGE_T, UNRESOLVED as u64)]
    );
}

#[test]
fn a_change_to_the_document_changes_its_tokens() {
    let vault = login_vault();
    let uri = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    client.open(&uri, "[[tokens]]\n");
    client.change(&uri, "text\n[[tokens|x]]\n");
    assert_eq!(
        client.tokens(&uri),
        [(1, 2, 6, PAGE_T, 0), (1, 9, 1, DISPLAY_T, 0)]
    );
}

#[test]
fn a_file_that_changes_on_disk_is_read_again() {
    let vault = login_vault();
    let uri = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    client.open(&uri, "[[fresh]]\n");
    assert_eq!(client.tokens(&uri), [(0, 2, 5, PAGE_T, UNRESOLVED as u64)]);
    vault.write("fresh.hmd", "# Fresh\n");
    client.notify(
        "workspace/didChangeWatchedFiles",
        json!({"changes": [{"uri": vault.uri("fresh.hmd"), "type": 1}]}),
    );
    assert_eq!(client.tokens(&uri), [(0, 2, 5, PAGE_T, 0)]);
}

#[test]
fn a_document_outside_every_vault_has_tokens_and_no_verdict() {
    let tree = Tree::new(&[("loose.hmd", "")]);
    let uri = tree.uri("loose.hmd");
    let mut client = Client::start();
    client.open(&uri, "[[anything]]\n");
    assert_eq!(client.tokens(&uri), [(0, 2, 8, PAGE_T, 0)]);
    assert_eq!(client.diagnostics(&uri), Some(vec![]));
    assert_eq!(client.at("textDocument/hover", &uri, 0, 4), Value::Null);
}

#[test]
fn a_document_with_no_file_has_tokens() {
    let mut client = Client::start();
    client.open("untitled:Untitled-1", "[[anything|shown]]\n");
    assert_eq!(
        client.tokens("untitled:Untitled-1"),
        [(0, 2, 8, PAGE_T, 0), (0, 11, 5, DISPLAY_T, 0)]
    );
}

#[test]
fn a_document_that_is_not_open_has_no_tokens() {
    let vault = login_vault();
    let mut client = Client::start();
    let result = client
        .request(
            "textDocument/semanticTokens/full",
            json!({"textDocument": {"uri": vault.uri("specs/login.hmd")}}),
        )
        .unwrap();
    assert_eq!(result, Value::Null);
}

#[test]
fn a_reference_leads_to_its_card() {
    let vault = login_vault();
    let uri = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    client.open(&uri, "see [[tokens]]\n");
    let top = json!({"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 0}});
    assert_eq!(
        client.at("textDocument/definition", &uri, 0, 8),
        json!([{"uri": vault.uri("shared/tokens.hmd"), "range": top}])
    );
    // Outside the reference there is nowhere to go.
    assert_eq!(client.at("textDocument/definition", &uri, 0, 1), json!([]));
}

#[test]
fn an_ambiguous_reference_leads_to_every_candidate() {
    let vault = Tree::vault(&[
        ("a/tokens.hmd", ""),
        ("b/tokens.hmd", ""),
        ("login.hmd", ""),
    ]);
    let uri = vault.uri("login.hmd");
    let mut client = Client::start();
    client.open(&uri, "[[tokens]]\n");
    let found = client.at("textDocument/definition", &uri, 0, 3);
    let uris: Vec<&str> = found
        .as_array()
        .unwrap()
        .iter()
        .map(|location| location["uri"].as_str().unwrap())
        .collect();
    assert_eq!(uris, [vault.uri("a/tokens.hmd"), vault.uri("b/tokens.hmd")]);
}

#[test]
fn hovering_a_reference_says_what_it_resolves_to() {
    let vault = login_vault();
    let uri = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    client.open(&uri, "see [[tokens]] and [[nowhere]]\n");

    let hover = client.at("textDocument/hover", &uri, 0, 8);
    assert_eq!(hover["contents"]["kind"], "markdown");
    assert_eq!(
        hover["contents"]["value"],
        "`shared/tokens.hmd`\n\nFound by autodiscovery: it is the only card whose path ends \
         with this name."
    );
    assert_eq!(
        hover["range"],
        json!({"start": {"line": 0, "character": 4}, "end": {"line": 0, "character": 14}})
    );

    let hover = client.at("textDocument/hover", &uri, 0, 22);
    assert_eq!(hover["contents"]["value"], "No card has this name.");

    assert_eq!(client.at("textDocument/hover", &uri, 0, 1), Value::Null);
}

#[test]
fn a_reference_that_does_not_resolve_is_reported() {
    let vault = Tree::vault(&[
        ("a/tokens.hmd", ""),
        ("b/tokens.hmd", ""),
        ("deep/login.hmd", ""),
    ]);
    let uri = vault.uri("deep/login.hmd");
    let mut client = Client::start();
    client.open(
        &uri,
        "[[nowhere]]\n[[tokens]]\n[[../../out]]\n[[/a/tokens]]\n",
    );
    let diagnostics = client.diagnostics(&uri).unwrap();
    let summary: Vec<(u64, &str, u64, &str)> = diagnostics
        .iter()
        .map(|d| {
            (
                d["range"]["start"]["line"].as_u64().unwrap(),
                d["code"].as_str().unwrap(),
                d["severity"].as_u64().unwrap(),
                d["message"].as_str().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        summary,
        [
            (0, "HMD001", 2, "[[nowhere]] does not resolve to a page"),
            (
                1,
                "HMD002",
                1,
                "[[tokens]] matches 2 pages; qualify it (candidates: a/tokens.hmd, b/tokens.hmd)"
            ),
            (
                2,
                "HMD003",
                1,
                "[[../../out]] resolves outside the namespace root"
            ),
        ]
    );
    assert_eq!(diagnostics[0]["source"], "hmd");
    assert_eq!(
        diagnostics[0]["range"],
        json!({"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 11}})
    );
}

#[test]
fn a_new_card_clears_the_report_in_another_card() {
    let vault = login_vault();
    let login = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    client.open(&login, "[[draft]]\n");
    assert_eq!(client.diagnostics(&login).unwrap().len(), 1);
    client.open(&vault.uri("draft.hmd"), "");
    assert_eq!(client.diagnostics(&login), Some(vec![]));
}

#[test]
fn a_closed_document_keeps_no_report() {
    let vault = login_vault();
    let login = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    client.open(&login, "[[nowhere]]\n");
    assert_eq!(client.diagnostics(&login).unwrap().len(), 1);
    client.close(&login);
    assert_eq!(client.diagnostics(&login), Some(vec![]));
}

#[test]
fn a_client_can_turn_the_reports_off() {
    let vault = login_vault();
    let login = vault.uri("specs/login.hmd");
    let mut client = Client::start_with(json!({"diagnostics": false}), json!({}));
    client.open(&login, "[[nowhere]]\n");
    client.change(&login, "[[nowhere]] again\n");
    client.close(&login);
    assert_eq!(client.diagnostics(&login), None);
    assert!(client.notifications.is_empty());
}

#[test]
fn the_server_asks_a_willing_client_to_watch_the_files() {
    let mut client = Client::start_with(
        Value::Null,
        json!({"workspace": {"didChangeWatchedFiles": {"dynamicRegistration": true}}}),
    );
    client.settle();
    assert_eq!(client.requests.len(), 1);
    let request = &client.requests[0];
    assert_eq!(request.method, "client/registerCapability");
    let registration = &request.params["registrations"][0];
    assert_eq!(registration["method"], "workspace/didChangeWatchedFiles");
    assert_eq!(
        registration["registerOptions"]["watchers"],
        json!([
            {"globPattern": "**/*.{hmd,md,markdown}"},
            {"globPattern": "**/.hmd/config.toml"},
        ])
    );
}

#[test]
fn the_server_asks_no_other_client_to_watch() {
    let mut client = Client::start();
    client.settle();
    assert!(client.requests.is_empty());
}

#[test]
fn a_request_the_server_does_not_know_is_refused() {
    let mut client = Client::start();
    let error = client
        .request("textDocument/rename", json!({}))
        .unwrap_err();
    assert_eq!(error.code, lsp_server::ErrorCode::MethodNotFound as i32);
}

#[test]
fn a_request_with_broken_parameters_is_refused_and_the_server_goes_on() {
    let vault = login_vault();
    let uri = vault.uri("specs/login.hmd");
    let mut client = Client::start();
    let error = client
        .request("textDocument/hover", json!({"textDocument": 7}))
        .unwrap_err();
    assert_eq!(error.code, lsp_server::ErrorCode::InvalidParams as i32);
    client.open(&uri, "[[tokens]]\n");
    assert_eq!(client.tokens(&uri).len(), 1);
}

#[test]
fn a_vault_keeps_its_namespace_root_from_its_configuration() {
    let vault = Tree::vault(&[
        (".hmd/config.toml", "location_path = \"wiki\"\n"),
        ("wiki/tokens.hmd", ""),
        ("wiki/login.hmd", ""),
        ("outside.hmd", ""),
    ]);
    let mut client = Client::start();
    let login = vault.uri("wiki/login.hmd");
    client.open(&login, "[[/tokens]] [[outside]]\n");
    assert_eq!(
        client.tokens(&login),
        [(0, 2, 7, PAGE_T, 0), (0, 14, 7, PAGE_T, UNRESOLVED as u64),]
    );
    // A card of the vault that lies outside the namespace root resolves
    // nothing and reports nothing.
    let outside = vault.uri("outside.hmd");
    client.open(&outside, "[[tokens]]\n");
    assert_eq!(client.tokens(&outside), [(0, 2, 6, PAGE_T, 0)]);
    assert_eq!(client.diagnostics(&outside), Some(vec![]));
}

#[test]
fn a_vault_whose_configuration_is_broken_resolves_nothing() {
    let vault = Tree::vault(&[
        (".hmd/config.toml", "location_path = [\n"),
        ("tokens.hmd", ""),
        ("login.hmd", ""),
    ]);
    let uri = vault.uri("login.hmd");
    let mut client = Client::start();
    client.open(&uri, "[[tokens]] [[nowhere]]\n");
    assert_eq!(
        client.tokens(&uri),
        [(0, 2, 6, PAGE_T, 0), (0, 13, 7, PAGE_T, 0)]
    );
    assert_eq!(client.diagnostics(&uri), Some(vec![]));
}

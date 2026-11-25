//! The built program: its arguments, and one session over its standard input
//! and output.

mod common;

use std::io::{BufReader, Write};
use std::process::{Command, Stdio};

use common::Tree;
use lsp_server::{Message, Notification, Request};
use serde_json::{Value, json};

const BINARY: &str = env!("CARGO_BIN_EXE_hmd-lsp");

#[test]
fn the_program_prints_its_version() {
    let output = Command::new(BINARY).arg("--version").output().unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).unwrap(),
        format!("hmd-lsp {}\n", env!("CARGO_PKG_VERSION"))
    );
}

#[test]
fn the_program_prints_its_help() {
    let output = Command::new(BINARY).arg("--help").output().unwrap();
    assert!(output.status.success());
    assert!(
        String::from_utf8(output.stdout)
            .unwrap()
            .contains("Usage: hmd-lsp")
    );
}

#[test]
fn the_program_refuses_an_argument_it_does_not_know() {
    let output = Command::new(BINARY).arg("--tcp").output().unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(
        String::from_utf8(output.stderr)
            .unwrap()
            .contains("unknown argument \"--tcp\"")
    );
}

#[test]
fn the_program_serves_a_session_and_exits_cleanly() {
    let vault = Tree::vault(&[("tokens.hmd", ""), ("login.hmd", "")]);
    let uri = vault.uri("login.hmd");

    let mut child = Command::new(BINARY)
        .arg("--stdio")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());

    let mut send = |message: Message| {
        message.write(&mut input).unwrap();
        input.flush().unwrap();
    };
    let mut answer = |id: i32| loop {
        match Message::read(&mut output)
            .unwrap()
            .expect("the program closed its output")
        {
            Message::Response(response) if response.id == id.into() => {
                return response.response_result.unwrap();
            }
            _ => {}
        }
    };

    send(
        Request::new(
            1.into(),
            "initialize".to_owned(),
            json!({"capabilities": {}}),
        )
        .into(),
    );
    assert_eq!(answer(1)["serverInfo"]["name"], "hmd-lsp");
    send(Notification::new("initialized".to_owned(), json!({})).into());
    send(
        Notification::new(
            "textDocument/didOpen".to_owned(),
            json!({"textDocument": {
                "uri": uri, "languageId": "hmd", "version": 1,
                "text": "[[tokens]] [[nowhere]]\n",
            }}),
        )
        .into(),
    );
    send(
        Request::new(
            2.into(),
            "textDocument/semanticTokens/full".to_owned(),
            json!({"textDocument": {"uri": uri}}),
        )
        .into(),
    );
    assert_eq!(answer(2)["data"], json!([0, 2, 6, 0, 0, 0, 11, 7, 0, 1]));
    send(Request::new(3.into(), "shutdown".to_owned(), Value::Null).into());
    answer(3);
    send(Notification::new("exit".to_owned(), Value::Null).into());

    let status = child.wait().unwrap();
    assert!(status.success(), "{status}");
}

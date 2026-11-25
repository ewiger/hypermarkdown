//! `hmd-lsp`: the HyperMarkDown language server, over standard input and
//! output.

use std::process::ExitCode;

use lsp_server::Connection;

const USAGE: &str = "\
The HyperMarkDown language server.

Usage: hmd-lsp [--stdio]
       hmd-lsp --version

The server speaks the Language Server Protocol over standard input and
output. An editor starts it; it is not run by hand.

Options:
  --stdio      Speak over standard input and output, which is the default
  -V, --version  Print the version
  -h, --help     Print this help
";

fn main() -> ExitCode {
    for argument in std::env::args().skip(1) {
        match argument.as_str() {
            // Editors pass this to say which transport they chose, and it is
            // the only one there is.
            "--stdio" => {}
            "-V" | "--version" => {
                println!("{} {}", hmd_lsp::server::NAME, env!("CARGO_PKG_VERSION"));
                return ExitCode::SUCCESS;
            }
            "-h" | "--help" => {
                print!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            other => {
                eprintln!("hmd-lsp: unknown argument {other:?}\n\n{USAGE}");
                return ExitCode::from(2);
            }
        }
    }

    let (connection, io_threads) = Connection::stdio();
    let served = hmd_lsp::server::run(&connection);
    // The writer thread ends when the last sender is dropped.
    drop(connection);
    let joined = io_threads.join();
    match (served, joined) {
        (Ok(()), Ok(())) => ExitCode::SUCCESS,
        (Err(err), _) => {
            eprintln!("hmd-lsp: {err}");
            ExitCode::FAILURE
        }
        (_, Err(err)) => {
            eprintln!("hmd-lsp: {err}");
            ExitCode::FAILURE
        }
    }
}

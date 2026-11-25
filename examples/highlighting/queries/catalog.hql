#!/usr/bin/env hql
// A standalone HQL program. Run it from this vault:
//
//     hql run queries/catalog.hql
//
// It reads the cards under `catalog/` and prints a table. Every kind of token
// the language has appears at least once, so the file is a quick look at the
// whole grammar.

/// The `metadata` block in the header of a catalog card.
type Meta {
    year    : Int
    typing  : String
    grammar : String
    note?   : String
}

/// The header of a catalog card, as far as this program reads it.
type Header : Data {
    title?    : String
    metadata? : Meta
}

/// One language of the catalog.
type Language {
    name    : String
    year    : Int
    typing  : String
    grammar : String
}

/// The age of a language in a given year.
fn age(language: Language, in_year: Int) : Int = in_year - language.year

/// Where the grammar of a language comes from, in words.
fn source(grammar: String) : String = match grammar {
    "built-in" => "ships with the editor",
    "extension" => "carried by this extension",
    other given other != "" => "needs an extension",
    _ => "unknown"
}

fn is_modern(language: Language) : Bool =
    language.year >= 2010 and not (language.typing == "dynamic")

languages = cards
| filter(c => c.path.starts_with("catalog/") and c.name != "index")
| flat_map(c => match (c.header | Header).metadata {
    some(m) => [Language(name = c.title, year = m.year, typing = m.typing, grammar = m.grammar)],
    _ => []
})

// Numbers: an Int with a negative literal, a Decimal, and a Float.
whole = 10 % 3 - -4
exact = 1.5 * 2.25
rough = 1.5f * 2.0e3f

languages
| filter(l => is_modern(l) or l.name == "Python")
| sort(by = l => l.year)
| map(l => {
    "Language": l.name,
    "Age": age(l, 2026),
    "Grammar": source(l.grammar),
    "Escapes": "tab\there, quote \"here\", slash \\ here"
})
| Table(columns = ["Language", "Age", "Grammar"])
| format(as = Markdown)

//! The catalog example as a Rust program.

#[derive(Debug, Clone, Copy)]
struct Language {
    name: &'static str,
    year: u16,
}

impl Language {
    fn age(&self, in_year: u16) -> u16 {
        in_year - self.year
    }
}

fn main() {
    let mut languages = [
        Language { name: "Python", year: 1991 },
        Language { name: "Rust", year: 2015 },
        Language { name: "HQL", year: 2026 },
    ];
    languages.sort_by_key(|l| l.year);
    for language in &languages {
        println!("{:<8} {:>3}", language.name, language.age(2026));
    }
}

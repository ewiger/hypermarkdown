"""The catalog example as a Python program."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Language:
    name: str
    year: int
    typing: str = "static"

    def age(self, in_year: int = 2026) -> int:
        return in_year - self.year


LANGUAGES = [Language("Python", 1991, "dynamic"), Language("Rust", 2015), Language("HQL", 2026)]

if __name__ == "__main__":
    for language in sorted(LANGUAGES, key=lambda l: l.year):
        print(f"{language.name:<8} {language.age():>3}")

/** The catalog example as a TypeScript program. */

interface Language {
  readonly name: string;
  readonly year: number;
  readonly typing?: "static" | "dynamic";
}

const age = (language: Language, inYear = 2026): number => inYear - language.year;

const languages: Language[] = [
  { name: "Python", year: 1991, typing: "dynamic" },
  { name: "Rust", year: 2015 },
  { name: "HQL", year: 2026 },
];

for (const language of [...languages].sort((a, b) => a.year - b.year)) {
  console.log(`${language.name.padEnd(8)} ${String(age(language)).padStart(3)}`);
}

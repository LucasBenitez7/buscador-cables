export default {
  extends: ["@commitlint/config-conventional"],
  // Los commits de Dependabot traen notas de versión con líneas de más de 100 caracteres.
  // Su cabecera ya sigue el formato (ver .github/dependabot.yml), así que no se validan.
  ignores: [(message) => message.includes("Signed-off-by: dependabot[bot]")],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "repo",
        "auth",
        "users",
        "cables",
        "locations",
        "search",
        "actions",
        "import",
        "export",
        "dashboard",
        "offline",
        "db",
        "shared",
        "ui",
        "web",
        "deps",
        "ci",
        "release",
      ],
    ],
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
  },
};

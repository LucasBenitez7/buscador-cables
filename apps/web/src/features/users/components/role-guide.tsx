import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@cables/shared";

/** From the least to the most: each role can also do everything of the ones above it here. */
const ORDER = [...ROLES].reverse();

/**
 * What each role can do, always in sight on the users page: the administrator chooses a role
 * reading it, when approving an account or changing one.
 */
export function RoleGuide() {
  return (
    <section aria-labelledby="role-guide" className="bg-card space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <h2 id="role-guide" className="text-base font-medium">
          Qué puede hacer cada rol
        </h2>
        <p className="text-muted-foreground text-xs">
          Cada rol puede hacer también todo lo de los anteriores. Da a cada persona el rol más bajo
          que le baste.
        </p>
      </div>
      <dl className="space-y-3">
        {ORDER.map((role) => (
          <div key={role} className="space-y-1">
            <dt className="text-primary text-sm font-semibold">{ROLE_LABELS[role]}</dt>
            <dd className="space-y-1 text-sm">
              <p>{ROLE_DESCRIPTIONS[role].summary}</p>
              <ul className="text-muted-foreground list-disc space-y-0.5 pl-5 text-xs">
                {ROLE_DESCRIPTIONS[role].can.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

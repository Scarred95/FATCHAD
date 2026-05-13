# Card Categories — FATCHAD

Categories control how the deck refill pool is partitioned.
The seeder uses them for bulk queries; the eligibility system uses them for filtering.

**Refill categories** (drawn automatically to top up the deck):
`politik`, `social`, `economy`, `chaos`
→ Defined in `game/deck.py → GENERIC_CATEGORIES`. Add a category here to make it
  part of the random refill pool.

**Non-refill categories** (injected explicitly via `adds_to_deck`):
`tutorial`, `ending`, and any questline-only categories
→ Cards in these categories should have `weight: 0` so they're never accidentally drawn.

---

## Existing

| Category   | Description |
|------------|-------------|
| `tutorial` | Onboarding cards. Gate with `flags_none: ["tutorial_done"]`. |
| `politik`  | Government, power structures, political deals. |
| `social`   | Public life, relationships, events. |
| `economy`  | Markets, money, business deals. |
| `chaos`    | Unpredictable, system-breaking events. |
| `ending`   | Questline finales. Always `weight: 0`. |

---

## Proposed

### Power & Politics
| Category        | Flavour |
|-----------------|---------|
| `justiz`        | Legal trouble, courts, lawyers, arrests. High respekt risk. |
| `militaer`      | Security forces, coups, arms deals, private security. High chaos. |
| `international` | Diplomacy, foreign investors, sanctions, summits. |
| `geheimdienst`  | Surveillance, blackmail, leaks, double agents. Flag-heavy. |

### Money & Crime
| Category          | Flavour |
|-------------------|---------|
| `kriminalitaet`   | Organised crime, street-level corruption, thugs-for-hire. |
| `unterwelt`       | Shadow economy, money laundering, cartel-adjacent deals. |
| `finanzen`        | Investments, bubbles, insider trading, hedge funds. |
| `immobilien`      | Property empires, gentrification, backroom rezoning. |

### Media & Culture
| Category   | Flavour |
|------------|---------|
| `medien`   | Press, TV, social media, viral moments, PR crises. Aura-heavy. |
| `kultur`   | Art world, celebrity galas, fashion, music industry. Rizz-heavy. |
| `sport`    | Sponsorships, match-fixing, stadium deals, athlete drama. |
| `religion` | Megachurches, cults, spiritual movements, moral outrage. |

### Science & Technology
| Category       | Flavour |
|----------------|---------|
| `technologie`  | Startups, AI, hacking, data leaks, surveillance tech. |
| `wissenschaft` | Research funding, biotech, pharmaceutical deals. |
| `energie`      | Oil, renewables, power grid control. Long economic arcs. |

### Personal & Social
| Category       | Flavour |
|----------------|---------|
| `beziehungen`  | Romantic entanglements, rivals, mentors, betrayals. Rizz-heavy. |
| `familie`      | Inheritance, family expectations, nepotism, dynasty building. |
| `gesundheit`   | Substance use, burnout, health scares, dependency arcs. |
| `bildung`      | Propaganda, re-education, think-tanks, degrees for sale. |

### Environment & Society
| Category    | Flavour |
|-------------|---------|
| `umwelt`    | Ecological disasters, greenwashing, carbon credits. |
| `bevoelkerung` | Public opinion, protests, populism, demographic shifts. |
| `natur`     | Natural disasters as opportunity or obstacle. |

---

## Design Notes

**Naming convention for flags:**
- State flags: `has_X`, `is_X` — e.g. `has_bodyguard`, `is_blacklisted`
- Event flags: `did_X`, `met_X` — e.g. `met_journalist`, `did_bribe_minister`
- Path flags: `path_X` — e.g. `path_money`, `path_violence`
- Arc blockers: `X_resolved`, `X_dead` — e.g. `journalist_resolved`, `minister_dead`
- Flags are one-time binary state; setting an already-set flag is a no-op. Use
  `flag_timers` (set in code) for flags that auto-expire after N turns.

**Weight guidelines:**
| Weight | Meaning |
|--------|---------|
| 0      | Never drawn by refill — questline / ending cards only |
| 1–3    | Very rare encounter |
| 5–10   | Standard card |
| 20–50  | Common filler |
| 80–100 | Tutorial / very high priority |

**Questline pattern:**
1. Entry card: normal weight, `flags_none: ["ql_X_resolved"]`
2. Follow-up cards: `weight: 0`, injected via `adds_to_deck` with `in_turns`
3. Resolution: sets `ql_X_resolved` to prevent re-triggering

**Chaos card rule of thumb:**
Cards in `chaos` category should push `chaos` by ±15–30. They're the main driver
of chaos extremes and should feel unpredictable — use `hints: { "chaos": "unknown" }`.

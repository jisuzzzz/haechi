---
name: plain
description: Rewrites a draft of lasting text so a reader gets it on the first pass — defines terms, puts examples first, cuts translationese and filler. Use for /haechi:plain, as the last step of any skill that writes a spec, merge request body, issue, doc or request, or when the user says a text is hard to read.
---

# Plain writing pass

The writing rules in the session rules cover chat. This pass is for text that stays: specs, merge request and pull request bodies, issues, docs, requests to other teams. Run it on the finished draft, just before you show or save it.

Readers rarely struggle with the content. They struggle with coined terms, forced translations and abstract rules without an example. Restating the same idea with a concrete example almost always fixes it.

## Checklist (any language)

1. **Every term is known or defined.** A term the reader may not know gets a one-line definition or an example the first time it appears. No coined terms; use the name people can search for. Keep an English technical term when developers know it better than the translation (worktree, hook, mutation).
2. **Example first.** Show one concrete case with real values, then state the rule. "Archiving 3 of 5 todos leaves 2" before "only finished todos are archived".
3. **One idea per sentence.** Split a sentence that carries two. No arrows or symbols as sentence glue in prose; tables and code are fine.
4. **Plain words.** The common word over the impressive one: "use" over "utilize", "start" over "initiate".
5. **Active voice with a named actor.** "The API returns 404", not "a 404 is returned".
6. **Concrete facts and numbers.** "Loads in 1.2 s instead of 3.4 s on a list of 500" over "much faster". Name the file, the endpoint, the screen.
7. **No flattery, hype or stock closings.** Drop "great question", "robust", "seamless", "hope this helps", "let me know if you have questions".
8. **Nothing the reader does not need.** Remove restated context, hedges that add no fact, and summaries of what was just said.

## Korean text only

9. **Translationese.** Rewrite stock patterns that come from translating English: "~를 통해" (through ~), "~하는 것이 중요하다" (it is important to ~), "~에 있어서" (in regard to ~), "~에 대해" piled on another "~에 대해", and passive forms such as "~되어지다". Say directly who does what.
10. **Long noun chains.** A string of four or more nouns ("데이터 검증 오류 처리 로직 개선") is hard to parse. Turn part of it into a verb or a short clause.

## English text only

11. **Em dashes as sentence glue.** Use a period or a comma. Keep a dash only where a real aside needs it.
12. **Filler words.** Replace "delve", "leverage", "utilize", "seamless", "robust", "crucial", "furthermore", "in order to", "it is worth noting that" with the plain word, or delete them.

## Output

Return the revised draft only. Keep the meaning, facts, code, names, numbers and any required artifact schema or repository template. Other labels and headings may change for clarity. Give a short list of what changed only when someone asks for it.

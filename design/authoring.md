# Homebrew authoring

The schema can say almost anything, but it is effectively a programming
language. Homebrew authors shouldn't have to learn it. The schema stays as it
is. Easy authoring comes from layers on top of it, and every layer produces the
same JSON.

## Layers

1. **Text only.** An entity can be just its text, with `gaps` marking what
   isn't automated. It displays and shares like anything else. An author
   automates one sentence at a time, or never.
2. **Copy and modify.** Most homebrew is a variation on something that exists:
   "Flame Tongue, but cold". Duplicate any entity and edit its sentences (layer
   4).
3. **Recipes.** Named templates for common shapes: "+N weapon", "item with
   charges that casts a spell", "once-per-rest bonus action that deals
   damage", "feat granting a proficiency and a resistance". Each is a short
   form. Which recipes to offer comes from the corpus once transcribed: the
   most frequent construct shapes, which the routing questions already count.
4. **Sentence editor.** Each mechanic is shown as its English rendering, with
   its parts editable in place: "You have [advantage] on [Dexterity] [saving
   throws] while [you aren't wearing heavy armor]." A slot opens the right
   control: a short list for a closed choice, search for an id, and a formula
   field (`1 + STR`, `>= 10`) for numbers and comparisons. "Add a condition"
   and "add an effect" insert new sentences. Every construct is reachable.
5. **JSON**, for power users, with the validator's readable errors.

A compact text syntax could later sit between layers 4 and 5, for technical
authors writing in a text editor: a strict one-to-one notation for the JSON that
parses and prints back losslessly, never free English. It's deferred until real
homebrew (the house-rules bundle) shows what it needs. Nobody types the English
rendering; the sentence editor edits the JSON under it and re-renders.

**LLM help** sits beside every layer. LLMs handle structured data well, so the
model writes the real schema, not an intermediate form. The JSON is validated,
then rendered to English, and the rendering is compared with the request. The
user confirms the sentence and never sees JSON unless they want to. It
should work with a small local model:
- **Retrieval:** examples come from the corpus, retrieved by similar text.
- **Constrained output:** decoding is constrained to the JSON Schema
  (vLLM and llama.cpp both support this), so the output always validates.
- **Comparison:** a second model compares the request with the rendering.

## The English renderer

Every construct gets a phrase, and composing phrases turns an entity's
mechanics into readable rules text. It is the foundation for three things:
- **Display:** browsers, tooltips, and "what does this actually do".
- **Verification:** a model compares the rendering with the
  book text, which is an easier question than judging JSON. That makes
  transcription checking cheaper and better.
- **Editing:** the rendered sentence *is* layer 4's editor.

## Spike results, 13 October 2026

`packages/render` renders the 82 rules, conditions, and states typed so far in
both editions, in about 450 lines. `node packages/render/scripts/render.ts
condition: -- bundles/srd bundles/srd24` prints them. Three samples:

> **Prone.** You have disadvantage on attack rolls. Attack rolls against you by
> attackers within 5 feet of you have advantage. Attack rolls against you by
> attackers farther than 5 feet from you have disadvantage. Each foot you move
> costs 1 extra foot. *Stand up.* If your speed isn't 0, you can spend movement
> equal to half your speed (rounded down) to end the Prone condition.

> **Help** (attack). As an action (the Help action), choose an enemy within 5
> feet of you. Until the start of your next turn, attack rolls against it by
> allies of yours have advantage.

> **Unarmed Strike: Grapple.** As one of the attacks of an action that makes
> attacks, such as the Attack action, if you have a hand free, choose a
> creature that is no more than one size larger than you and within 5 feet of
> you. It must succeed on a Strength or Dexterity saving throw (its choice; DC
> 8 + your Strength modifier + your proficiency bonus) or it gains the
> Grappled condition.

What it took:
- **Perspective.** Most of the work was keeping "you" straight. Inside an
  applied state, "you" is the state's holder, and its source is whoever acted.
  A condition's source reads as the book names it, so states gained an
  optional `sourceName` ("the charmer", "the grappler").
- **Ordering.** A filtered target reads best chosen first and then called
  "it". Formulas read best after the noun: "Bludgeoning damage equal to 1 + your
  Strength modifier", "(DC 8 + …)".
- **Gaps stay visible.** An uncovered construct renders as `[type]`.

It reads like rules text, a little stiffer than the book. It's good enough to
display and to check against, and a sentence editor can be built on it.

**Verification.** In the spike, a small local model was asked whether each
rendering, and a deliberately broken copy of it, contradicted the book
text. One broad question ("nothing in the description contradicts the book
text") separated correct renderings from broken ones well (AUC 0.90);
narrow questions such as "every number matches" did worse. For the same
entity the correct rendering outscored its broken copy in 51 of 52 pairs,
so comparing two candidates works better than judging one. The scripts
were removed with the transcription tooling (git, commit a64b0e587).

Not tested yet: whether nontechnical authors find the sentence editor usable.
That needs the editor.

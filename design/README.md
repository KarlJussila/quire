# Quire schema design

The content model for the bundles in `../bundles/`. The schema itself is
authored in TypeBox in `../packages/schema/src`; these documents explain it.
When a document and the schema disagree, the schema is right and the
document gets fixed.

| File | Contents |
|---|---|
| [model/](model/README.md) | The grammar, one file per topic: vocabulary, roles and values, predicates, effects, states, activities, costs and the action economy, triggers and events, choices, content kinds, the character, and worked examples |
| [encoding.md](encoding.md) | Conventions for writing a book's rule, or a homebrew one, in the grammar |
| [bundles.md](bundles.md) | Bundles, manifests, ids and editions, and what the loader does |
| [authoring.md](authoring.md) | How homebrew authoring stays usable on a complex schema: layers, and the English renderer |

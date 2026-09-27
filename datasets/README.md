# HUMAID-NER

HUMAID-NER is an English disaster-tweet dataset for joint humanitarian-category classification and span-level named entity recognition. It extends the HumAID benchmark with character-offset annotations for ten operational entity types.

## Files

| File | Purpose |
| --- | --- |
| `train.parquet` | Training split with nested entity annotations. |
| `validation.parquet` | Validation split with nested entity annotations. |
| `test.parquet` | Test split with nested entity annotations. |
| `records.csv` | Flat record table for classification and joins. |
| `entities.csv` | One row per entity span, keyed by `record_id`. |
| `schema.json` | Machine-readable field definitions. |
| `label_definitions.json` | Humanitarian categories, entity types, and BIO mapping. |
| `validation_report.json` | Release-level integrity checks. |
| `CITATION.cff` | Citation metadata. |
| `LICENSE.md` | License and responsible-use notes. |

## Recommended format

Use the Parquet files for model training because they preserve the nested `entities` field. Use `records.csv` and `entities.csv` for spreadsheet, SQL, notebook, and relational workflows.

## Core record fields

- `record_id`: stable text-derived identifier
- `text`: English disaster-related social-media text
- `humanitarian_category`: document-level category slug
- `entities`: list of character-offset entity structs in Parquet
- `entity_count`: number of entities in the record

Entity offsets are zero-based Unicode code-point positions and `end_char` is exclusive.

## Data splits

| Split | Records |
| --- | ---: |
| Train | 53,531 |
| Validation | 7,788 |
| Test | 15,159 |

The release contains 245,180 entity spans. Record identifiers are unique and the splits are disjoint.

## Intended use

The dataset supports non-commercial research in crisis informatics, disaster-response NLP, named entity recognition, humanitarian text classification, and multitask learning.

## Limitations and responsible use

- Entity annotations were produced by a hybrid automated pipeline and may contain annotation errors.
- Social-media language and disaster-response terminology change over time.
- Labels are imbalanced; report per-class metrics in addition to aggregate scores.
- Text may contain sensitive or distressing content. Do not identify, profile, target, or contact individuals.
- Do not use model output as the sole basis for emergency-response decisions.
- Follow the source platform's terms, the dataset license, and applicable law.

## Dataset distributions

- [Hugging Face](https://huggingface.co/datasets/AijazAli7/humaid-ner) — direct loading with the Hugging Face `datasets` library and split-based Parquet files.
- [Kaggle](https://www.kaggle.com/datasets/aijazlaghari/humaid-ner-disaster-tweets) — Parquet splits, normalized CSV tables, metadata, and supporting documentation.

## License

HUMAID-NER is an adaptation of the HumAID dataset published by the Qatar Computing Research Institute under CC BY-NC-SA 4.0.

HUMAID-NER adds disaster-specific span-level entity annotations, standardized labels, validated character offsets, and research-ready data formats. This adapted release is distributed under CC BY-NC-SA 4.0. The original authors and QCRI do not necessarily endorse this adaptation.

License:
https://creativecommons.org/licenses/by-nc-sa/4.0/

Upstream dataset:
https://huggingface.co/datasets/QCRI/HumAID-all

## Attribution

Users of this dataset should cite both HUMAID-NER and the original HumAID publication.

HUMAID-NER:
https://doi.org/10.62019/zabvxd97

Original HumAID:
https://doi.org/10.1609/icwsm.v15i1.18116

# The Gift of Being Yourself

Editable 20-slide, 16:9 presentation based on Gendy's supplied PDF brief.
English titles and key ideas accompany Egyptian Arabic explanations and embedded
speaker notes. Suggested timings total 24 minutes 40 seconds, including audience
pauses. Rehearse and adjust to your delivery pace.

## Open and edit

Open `output/The-Gift-of-Being-Yourself.pptx` in PowerPoint. Titles, captions,
Arabic text, the Self/Personality diagram and the David/Peter comparison table
are native editable objects. Use the Notes pane or Presenter View for the script.

On slide 19, select the DST or SHEEN picture and choose **Picture Format > Change
Picture**. Keep its aspect ratio locked and use Fit rather than stretching it.
Both supplied logo files are unchanged and are separate image objects. The DST
orange background is part of the original JPEG. SHEEN retains its PNG alpha.
The logos illustrate different creative expressions, not a new sponsorship claim.

Character scenes are artistic interpretations, not historical photographs or
movie stills. The Gage photograph is historical. The brain images and injury path
are simplified educational illustrations, not scans or precise reconstructions.
Scientific, biblical and literary references are in the relevant slide notes.

## Files

- `content.mjs`: slide text, Egyptian Arabic script, timing, transitions and sources.
- `build.mjs`: Artifact Tool authoring source.
- `prepare_pptx.py`: adds explicit Arabic RTL and language metadata in native XML.
- `finalize.mjs`: structural, layout, slide-count and native-object validation.
- `speaker-notes.txt`: convenient script copy.
- `assets/`: supplied logos, generated replaceable artwork and historical portrait.

Arial is the portable font used for both languages because it is available in the
authoring and PowerPoint environment. It replaces the brief's suggested font
options without rasterizing the text.

## Rebuild

Requires the Codex bundled Node/Python runtime and `@oai/artifact-tool`. Set
`CODEX_RUNTIME_ROOT` to the bundled `dependencies` folder if it is elsewhere.
Use bundled Node to run `build.mjs`, bundled Python to run `prepare_pptx.py`,
then bundled Node to run `finalize.mjs`. Set `RUNTIME_NODE_MODULES` to the bundled
Node modules folder for the finalizer's child process. Run from the repo root.
Build staging is ignored under `tmp/gift-build`.

The finalizer intentionally refuses to replace an existing final output. Move the
old export aside or change the output name before rebuilding. Source and draft
files remain independent. `SKIP_RENDER=1` skips Artifact Tool draft previews when
using PowerPoint for final visual QA instead.

## Attribution

Historical portrait: photograph by Jack and Beverly Wilgus of the Phineas Gage
daguerreotype, now in the Warren Anatomical Museum, Harvard. The supplied image
is fitted intact, without artistic alteration.
[Museum context and download](https://hms.harvard.edu/news/new-view-phineas-gage).
[Image description and license](https://commons.wikimedia.org/wiki/File:Phineas_Gage_Cased_Daguerreotype_WilgusPhoto2008-12-19_Unretouched_Color.jpg).
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
That license applies to this photographic asset, not automatically to the rest
of this presentation.

Other illustrations: AI-generated editorial artwork created for this deck.
DST and SHEEN logos: original files provided by Gendy, with their existing rights.
No ownership or authorship claims are made for either logo.

Scientific references:
[Raichle et al. (2001)](https://doi.org/10.1073/pnas.98.2.676),
[Buckner et al. (2008)](https://doi.org/10.1196/annals.1440.011),
[Gusnard et al. (2001)](https://doi.org/10.1073/pnas.071043098),
[Macmillan & Lena (2010)](https://pubmed.ncbi.nlm.nih.gov/20480430/).
Gage's behavioral changes are historically reported and have evidentiary limits.
The DMN contributes to several kinds of internal thought and is not a location
of the self. Biblical applications and literary interpretations are distinguished
from neuroscience evidence.

The PDF's quoted assistant instructions were treated as an implementation brief,
not as instructions to contact another assistant or create placeholders despite
the supplied logos. Its sample-first suggestion informed internal review and did
not require stopping the user's authorized implementation.

# Content access

NLA content is resolved metadata-first. The server reads each bitstream's DSpace metadata, format, and access status before deciding whether content can be returned inline.

Technical access is not permission for reuse. Source-declared rights fields are evidence only; missing or public-access metadata must not be interpreted as public-domain or licensed status. Review [Data and Content Rights](../DATA_AND_CONTENT_RIGHTS.md) before copying, publishing, training on, or redistributing material.

## Recommended workflow

1. Find an item with `search_catalog` or `resolve_identifier`.
2. Call `list_item_files` to see bundles and their bitstreams.
3. For document text, call `get_item_text` and follow `nextOffset` with `offset_chars`.
4. For an original file, use `get_file_download` and its canonical NLA HTTPS URL. MCP content resource links are present only for the reviewed inline-content allowlist.

Only NLA-provided `text/plain` files in a `TEXT` bundle are selected by `get_item_text`. The provenance is labelled `nla-provided-extracted-text`; no local PDF extraction or OCR is performed.

On a cold cache, `list_item_files` makes two enumeration requests plus two detail requests (format and access) for each returned bitstream. Detail requests run under the global concurrency bound and identical requests are coalesced; the regression suite fixes the one-file budget at four upstream calls. Use small continuation pages when an item has many files.

## Limits

- `get_item_text` defaults to 8,000 Unicode code points and is capped by `NLA_MAX_TEXT_CHARS`.
- Text extraction files are downloaded as whole files and must fit the independent `NLA_MAX_TEXT_BYTES` ceiling (8 MiB by default, 64 MiB maximum). Chunking limits MCP output size, not upstream transfer size.
- Offsets count Unicode code points, so chunks do not split surrogate pairs.
- Full text resources are returned only when the complete text fits `NLA_MAX_TEXT_CHARS`.
- Binary resources are returned as base64 only for signature-matched PNG, JPEG, or GIF data when metadata size and streamed bytes both fit `NLA_MAX_INLINE_BINARY_BYTES`.
- HTML, SVG, XML, JavaScript, PDF, Office/macro formats, archives, and unknown types are never returned inline. Public records can still expose metadata and a canonical NLA `/content` URL for clients to handle under their own sandbox and content policy.
- Larger files are not fetched by the resource handler. Tools return their byte size, declared MIME type, explicit verification state, access status, and—when public—the canonical NLA `/content` URL.
- Restricted, embargoed, missing, and unknown access states do not receive content resource links or canonical download URLs.
- Streamed responses are bounded even when `Content-Length` is missing or incorrect.

All extracted text, filenames, and metadata are untrusted source data. Terminal control characters are removed, but source text is otherwise preserved and must never be treated as server or agent instructions.

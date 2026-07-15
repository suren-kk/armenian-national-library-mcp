# Search and refinement guide

Start with `search_catalog`. Use `get_search_facets` when the first page is too broad, then reuse facet names and values exactly as returned by NLA. You do not need to know or call the DSpace REST API directly.

## Basic search

```json
{
  "query": "Armenian history",
  "dso_type": "item",
  "page_size": 5
}
```

Results include normalized titles, authors, subjects, dates, identifiers, rights evidence, a canonical NLA URL, highlights, pagination, and provenance. Keep `include_metadata` false until a task genuinely needs every raw metadata field.

## Discover available refinements

Call `get_search_facets` with the same query. When a facet name is returned, call it again with `facet` to inspect values. Common NLA facets include `author`, `subject`, `dateIssued`, `language`, and `type`, but callers should use only names and values advertised by the current response.

Apply an exact returned value:

```json
{
  "query": "Armenia",
  "filters": [
    {
      "field": "author",
      "value": "Returned author value",
      "operator": "equals"
    },
    {
      "field": "language",
      "value": "Returned language value",
      "operator": "equals"
    }
  ]
}
```

Supported operators are:

- `equals`: exact facet value;
- `contains`: text contained in the field;
- `notequals`: exclude the value; and
- `authority`: match a DSpace authority key returned by NLA.

Repeated filters are preserved and combined as AND constraints. Use fewer constraints when a search unexpectedly returns no records.

## Year, subject, and language

The field name and value must come from `get_search_facets`. A typical refinement sequence is:

1. Search the topic.
2. Inspect the `subject` facet and apply one returned subject.
3. Inspect `dateIssued` and apply a returned year or range label.
4. Inspect `language` and apply the exact code or label NLA returned.

This avoids guessing whether a collection uses a language code, localized label, or legacy metadata value.

## Sorting

`sort` must use `field,ASC` or `field,DESC`. Examples accepted locally include `score,DESC`, `dc.date.issued,DESC`, and `dc.title,ASC`. NLA can reject a syntactically valid field it does not index; remove the sort or use one observed in the current catalogue behavior.

## Collection scope

Use `list_communities`, `list_community_collections`, or `list_collections` to obtain a collection UUID. Then call `list_collection_items`, or pass that UUID as `scope_uuid` to search/facet tools. UUIDs must come from NLA results rather than being invented.

## Troubleshooting no results

- Remove filters one at a time.
- Copy facet values exactly, including punctuation and case.
- Use `contains` only when exact matching is too narrow.
- Confirm that `scope_uuid` identifies the intended community or collection.
- Use `browse_catalog` for author, title, subject, date, or SRSC index exploration when no keyword query is known.

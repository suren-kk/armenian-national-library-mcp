import { describe, expect, it } from "vitest";
import { itemTextInput, searchCatalogInput } from "../../src/schemas/inputs.js";

describe("agent-friendly input defaults", () => {
  it("keeps discovery output compact unless raw metadata is requested", () => {
    const value = searchCatalogInput.parse({ query: "Armenia" });
    expect(value).toMatchObject({
      page: 0,
      page_size: 10,
      filters: [],
      include_metadata: false,
    });
  });

  it("reads text in bounded chunks by default", () => {
    const value = itemTextInput.parse({ item_id: "123456789/10740" });
    expect(value).toMatchObject({ offset_chars: 0, max_chars: 8_000 });
  });
});

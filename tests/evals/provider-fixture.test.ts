import { describe, expect, it } from "vitest";
import {
  createProviderEvalRepository,
  EVAL_FIXTURE_IDS,
} from "../../src/evals/provider-fixture.js";

describe("provider evaluation raw API boundary", () => {
  const repository = createProviderEvalRepository("ru-auth-required-endpoint");

  it.each([
    "/authz/authorizations/search/object",
    "/api/authz/authorizations",
    "https://example.com/core/sites",
    "/core/sites/../items",
    "/core/bitstreams/123/content",
  ])(
    "rejects a disallowed raw request instead of inventing success: %s",
    async (path) => {
      await expect(
        repository.rawApiGet({ method: "GET", path, query: {} }),
      ).rejects.toMatchObject({ code: "NLA_INVALID_RESPONSE" });
    },
  );

  it.each(["GET", "HEAD"] as const)(
    "preserves the approved %s request",
    async (method) => {
      const result = await repository.rawApiGet({
        method,
        path: "/core/sites",
        query: {},
      });
      expect(result.data).toEqual({
        method,
        path: "/core/sites",
        status: 200,
        contentType: "application/json",
        body: method === "HEAD" ? null : {},
      });
    },
  );
});

describe("provider evaluation evidence and content access", () => {
  it("provides complete original-file evidence without an additional download call", async () => {
    const repository = createProviderEvalRepository("ru-multiple-files");
    const item = await repository.getItem(EVAL_FIXTURE_IDS.multiFileHandle);
    const files = await repository.listItemFiles(item.data.normalized.uuid);
    const originals = files.data.bundles.find(
      (bundle) => bundle.classification === "ORIGINAL",
    )!.files;
    expect(originals).toHaveLength(2);
    expect(originals[0]).toMatchObject({
      mimeType: "application/pdf",
      access: { publiclyReadable: true },
    });
    expect(originals[0]!.downloadUrl).toContain(
      EVAL_FIXTURE_IDS.originalPdfUuid,
    );
  });

  it("keeps authoritative restrictions consistent across metadata, text, and downloads", async () => {
    const repository = createProviderEvalRepository(
      "adv-en-false-public-access",
    );
    const status = await repository.getItemAccessStatus(
      EVAL_FIXTURE_IDS.restrictedHandle,
    );
    expect(status.data).toMatchObject({
      status: "restricted",
      publiclyReadable: false,
    });
    const files = await repository.listItemFiles(
      EVAL_FIXTURE_IDS.restrictedHandle,
    );
    expect(files.data.bundles[0]!.files[0]).toMatchObject({
      downloadUrl: null,
      access: { publiclyReadable: false },
    });
    await expect(
      repository.getItemText(EVAL_FIXTURE_IDS.restrictedHandle, {
        offsetChars: 0,
        maxChars: 100,
      }),
    ).rejects.toMatchObject({ code: "NLA_ACCESS_RESTRICTED" });
    await expect(
      repository.getFileDownload(EVAL_FIXTURE_IDS.restrictedPdfUuid),
    ).rejects.toMatchObject({ code: "NLA_ACCESS_RESTRICTED" });
  });

  it("returns bounded text continuation and rejects an invented bitstream UUID", async () => {
    const repository = createProviderEvalRepository("ru-find-exact-passage");
    const first = await repository.getItemText(EVAL_FIXTURE_IDS.primaryHandle, {
      offsetChars: 0,
      maxChars: 8000,
    });
    expect(first.data.nextOffset).toBe(8000);
    expect(first.data.returnedChars).toBe(8000);
    const second = await repository.getItemText(
      EVAL_FIXTURE_IDS.primaryHandle,
      { offsetChars: first.data.nextOffset!, maxChars: 8000 },
    );
    expect(second.data.text).toContain(EVAL_FIXTURE_IDS.exactPassage);
    await expect(
      repository.getBitstream(EVAL_FIXTURE_IDS.falseBitstreamUuid),
    ).rejects.toMatchObject({ code: "NLA_NOT_FOUND" });
  });
});

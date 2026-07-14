import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import type { AppConfig } from "../config.js";
import type { NlaContentResolver } from "../nla/content-resolver.js";
import { NlaError } from "../nla/errors.js";
import { sanitizeUpstreamText } from "../security/output-sanitizer.js";

function variable(variables: Variables, name: string): string {
  const value = variables[name];
  if (typeof value !== "string") {
    throw NlaError.invalidResponse(
      `Resource template variable ${name} is invalid`,
    );
  }
  return value;
}

export function registerBitstreamResources(
  server: McpServer,
  resolver: NlaContentResolver,
  config: AppConfig,
): void {
  server.registerResource(
    "nla-bitstream-metadata",
    new ResourceTemplate("nla://bitstream/{uuid}", { list: undefined }),
    {
      title: "NLA bitstream metadata",
      description:
        "Verified metadata, format, access status, and download location for an NLA bitstream.",
      mimeType: "application/json",
    },
    async (uri, variables, extra) => {
      const result = await resolver.getBitstream(
        variable(variables, "uuid"),
        extra.signal,
      );
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  server.registerResource(
    "nla-bitstream-content",
    new ResourceTemplate("nla://bitstream/{uuid}/content", { list: undefined }),
    {
      title: "NLA bitstream content",
      description:
        "Inline content for bounded text or small binary NLA bitstreams. Large files remain available through their HTTPS download URL.",
    },
    async (uri, variables, extra) => {
      const result = await resolver.readBitstreamContent(
        variable(variables, "uuid"),
        extra.signal,
      );
      if (result.bitstream.mimeType.toLowerCase().startsWith("text/plain")) {
        const text = sanitizeUpstreamText(
          new TextDecoder("utf-8", { fatal: false }).decode(result.bytes),
        );
        const characterCount = Array.from(text).length;
        if (characterCount > config.nla.maxTextChars) {
          throw NlaError.responseTooLarge(
            config.nla.maxTextChars,
            characterCount,
          );
        }
        return {
          contents: [
            { uri: uri.toString(), mimeType: result.bitstream.mimeType, text },
          ],
        };
      }
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: result.bitstream.mimeType,
            blob: Buffer.from(result.bytes).toString("base64"),
          },
        ],
      };
    },
  );

  server.registerResource(
    "nla-item-text",
    new ResourceTemplate("nla://item/{uuid}/text", { list: undefined }),
    {
      title: "NLA item extracted text",
      description:
        "Complete NLA-provided extracted text when it fits the configured resource limit; use get_item_text for larger documents.",
      mimeType: "text/plain",
    },
    async (uri, variables, extra) => {
      const itemUuid = variable(variables, "uuid");
      const result = await resolver.getItemText(
        {
          itemUuid,
          offsetChars: 0,
          maxChars: config.nla.maxTextChars,
        },
        extra.signal,
      );
      if (result.data.nextOffset !== null) {
        throw NlaError.responseTooLarge(
          config.nla.maxTextChars,
          result.data.totalChars,
        );
      }
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/plain",
            text: result.data.text,
          },
        ],
      };
    },
  );
}

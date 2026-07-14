# Third-Party Notices

Generated/reviewed for runtime dependency versions locked on 2026-07-14.

`nla-research-mcp` depends on third-party open-source software. The root MIT License applies to this project's original software; it does not replace the licences of dependencies.

## Direct runtime dependencies

| Component                   | Version | Licence | Copyright/author notice                   | Source                                                   |
| --------------------------- | ------- | ------- | ----------------------------------------- | -------------------------------------------------------- |
| `@modelcontextprotocol/sdk` | 1.29.0  | MIT     | Copyright (c) 2024 Anthropic, PBC         | <https://github.com/modelcontextprotocol/typescript-sdk> |
| `yaml`                      | 2.9.0   | ISC     | Copyright Eemeli Aro `<eemeli@gmail.com>` | <https://github.com/eemeli/yaml>                         |
| `zod`                       | 4.4.3   | MIT     | Copyright (c) 2025 Colin McDonnell        | <https://github.com/colinhacks/zod>                      |

The complete transitive graph and exact resolved versions are recorded in `package-lock.json`. `npm run security:licenses` verifies that every locked npm package declares an approved SPDX licence, and `npm run security:sbom` generates a CycloneDX inventory for production dependencies. Installed npm packages retain their own `LICENSE`/notice files in `node_modules`; those files contain the controlling licence text.

## Container distribution

The container uses the official digest-pinned `node:24.15.0-bookworm-slim` image and therefore contains Node.js, Debian, and transitive operating-system components under their respective licences. Debian copyright notices are available inside the image under `/usr/share/doc/*/copyright`; npm dependency notices remain in `/app/node_modules`. A container distributor must retain those notices and should attach an SBOM for the exact published digest.

## No third-party content licence

NLA catalogue data, extracted text, images, publications, and linked files are not bundled as project dependencies and are not licensed by this notice. See [DATA_AND_CONTENT_RIGHTS.md](DATA_AND_CONTENT_RIGHTS.md).

If a required notice is missing or inaccurate, contact `surenakar@gmail.com` with the component name and source.

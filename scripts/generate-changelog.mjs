import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const changelogJsonPath = path.join(rootDir, 'changelog.json');
const outputDocxPath = path.join(rootDir, 'CHANGELOG.docx');

const changelog = JSON.parse(fs.readFileSync(changelogJsonPath, 'utf-8'));

function makePolicyTable(policy) {
  const rows = [
    ['Major Releases', policy.majorFormat],
    ['Minor Updates (.xx)', policy.minorFormat],
    ['Data & Upgrade Safety', policy.upgradeSafety],
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, desc]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              shading: { fill: 'EEF2FF', type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 140, right: 140 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: label,
                      bold: true,
                      size: 20,
                      color: '1E1B4B',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 72, type: WidthType.PERCENTAGE },
              margins: { top: 100, bottom: 100, left: 140, right: 140 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: desc,
                      size: 20,
                      color: '1F2937',
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
    ),
  });
}

const children = [
  new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: `${changelog.appName} — Release Changelog`,
        bold: true,
        size: 40,
        color: '1E1B4B',
      }),
    ],
  }),
  new Paragraph({
    spacing: { after: 240 },
    children: [
      new TextRun({
        text: `Generated automatically from changelog.json · Last updated: ${new Date().toISOString().slice(0, 10)}`,
        italics: true,
        size: 19,
        color: '6B7280',
      }),
    ],
  }),
  makePolicyTable(changelog.versioningPolicy),
  new Paragraph({ text: '', spacing: { after: 200 } }),
];

for (const release of changelog.releases) {
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 100 },
      border: {
        bottom: {
          color: '6366F1',
          space: 4,
          style: BorderStyle.SINGLE,
          size: 12,
        },
      },
      children: [
        new TextRun({
          text: `${release.displayVersion} (SemVer ${release.semver})`,
          bold: true,
          size: 30,
          color: '312E81',
        }),
        new TextRun({
          text: `   —   ${release.releaseType} · ${release.date}`,
          size: 21,
          color: '4B5563',
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: release.summary,
          size: 21,
          color: '111827',
        }),
      ],
    })
  );

  if (release.dataMigrationNote) {
    children.push(
      new Paragraph({
        spacing: { after: 140 },
        shading: { fill: 'ECFDF5', type: ShadingType.CLEAR },
        children: [
          new TextRun({
            text: 'Upgrade & Data Preservation: ',
            bold: true,
            size: 19,
            color: '065F46',
          }),
          new TextRun({
            text: release.dataMigrationNote,
            size: 19,
            color: '064E3B',
          }),
        ],
      })
    );
  }

  for (const group of release.changes) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 140, after: 60 },
        children: [
          new TextRun({
            text: group.category,
            bold: true,
            size: 23,
            color: '1F2937',
          }),
        ],
      })
    );

    for (const item of group.items) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: item,
              size: 20,
              color: '374151',
            }),
          ],
        })
      );
    }
  }
}

children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 320 },
    children: [
      new TextRun({
        text: 'WatchPulse — All updates preserve existing user data (%APPDATA%\\watchpulse and legacy %APPDATA%\\modelsort-studio migration).',
        size: 18,
        italics: true,
        color: '9CA3AF',
      }),
    ],
  })
);

const doc = new Document({
  sections: [{ children }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputDocxPath, buffer);
console.log(`Updated ${outputDocxPath} (${buffer.length} bytes)`);

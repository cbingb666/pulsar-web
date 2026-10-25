import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  englishMessages,
  getLocale,
  resolveLocale,
  setLocale,
  subscribeLocale,
  t,
  translate,
} from "../src/i18n.ts";
import { bindingLabel, dpiLockBinding } from "../src/protocol.ts";
import {
  describeMacroEvent,
  parseMacros,
  serializeMacros,
  validateMacroEvent,
  type Macro,
} from "../src/macros.ts";
import { importFusionCsv } from "../src/native-files.ts";

const srcDirectory = fileURLToPath(new URL("../src/", import.meta.url));

function placeholders(message: string): string[] {
  return [...new Set(message.match(/\{\d+\}/g) ?? [])].sort();
}

test("locale preference wins; browser language order selects Chinese or English", () => {
  assert.equal(resolveLocale("zh-CN", ["en-US"]), "zh-CN");
  assert.equal(resolveLocale("en", ["zh-CN"]), "en");
  assert.equal(resolveLocale(null, ["zh-TW", "en-US"]), "zh-CN");
  assert.equal(resolveLocale(null, ["EN-gb", "zh-CN"]), "en");
  assert.equal(resolveLocale(null, ["fr-FR", "zh-HK"]), "zh-CN");
  assert.equal(resolveLocale(null, ["fr-FR", "en"]), "en");
  assert.equal(resolveLocale("unsupported", ["zh"]), "zh-CN");
  assert.equal(resolveLocale(null, ["fr-FR"]), "en");
  assert.equal(resolveLocale(null, []), "en");
});

test("translation preserves user substitutions as data in either language", () => {
  const userText = "自定义 {0} {1} $& $` $'";
  const source = "第 {0} 行包含不支持的键名：{1}";
  assert.equal(
    translate(source, [7, userText], "en"),
    `Line 7 contains an unsupported key name: ${userText}`,
  );
  assert.equal(
    translate(source, [7, userText], "zh-CN"),
    `第 7 行包含不支持的键名：${userText}`,
  );
  assert.equal(
    translate("Unregistered diagnostic", [], "en"),
    "Unregistered diagnostic",
  );
  const previous = getLocale();
  try {
    setLocale("en");
    assert.equal(
      t`第 ${7} 行包含不支持的键名：${userText}`,
      `Line 7 contains an unsupported key name: ${userText}`,
    );
  } finally {
    setLocale(previous);
  }
});

test("every English message preserves all source interpolation placeholders", () => {
  for (const [catalogName, catalog] of Object.entries({
    englishMessages,
  })) {
    for (const [source, english] of Object.entries(catalog)) {
      assert.ok(
        english.trim(),
        `${catalogName}: empty translation for ${source}`,
      );
      assert.deepEqual(
        placeholders(english),
        placeholders(source),
        `${catalogName}: interpolation mismatch for ${source}`,
      );
    }
  }
});

test("all literal and tagged-template translation calls have English messages", () => {
  const missing: string[] = [];
  for (const filename of readdirSync(srcDirectory).filter((name) =>
    /\.tsx?$/.test(name),
  )) {
    const source = ts.createSourceFile(
      filename,
      readFileSync(new URL(`../src/${filename}`, import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const check = (key: string, node: ts.Node) => {
      if (!Object.hasOwn(englishMessages, key)) {
        const line =
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        missing.push(`${filename}:${line}: ${JSON.stringify(key)}`);
      }
    };
    const visit = (node: ts.Node) => {
      // Include source labels translated dynamically (navigation, buttons, firmware target).
      if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node)) &&
        /[\u4e00-\u9fff]/.test(node.text) &&
        !(
          filename === "native-files.ts" &&
          ["かたかなひらがなローマ字", "変換", "無変換"].includes(node.text)
        )
      )
        check(node.text, node);
      if (ts.isJsxText(node) && /[\u4e00-\u9fff]/.test(node.text))
        assert.equal(
          node.text.trim(),
          "中文",
          `${filename}: untranslated JSX text`,
        );
      if (
        ts.isStringLiteral(node) &&
        ts.isJsxAttribute(node.parent) &&
        /[\u4e00-\u9fff]/.test(node.text)
      )
        assert.fail(`${filename}: untranslated JSX attribute ${node.text}`);
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t"
      ) {
        const argument = node.arguments[0];
        if (
          argument &&
          (ts.isStringLiteral(argument) ||
            ts.isNoSubstitutionTemplateLiteral(argument))
        )
          check(argument.text, node);
      }
      if (
        ts.isTaggedTemplateExpression(node) &&
        ts.isIdentifier(node.tag) &&
        node.tag.text === "t"
      ) {
        const template = node.template;
        const key = ts.isNoSubstitutionTemplateLiteral(template)
          ? template.text
          : template.head.text +
            template.templateSpans
              .map((span, index) => `{${index}}${span.literal.text}`)
              .join("");
        check(key, node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(
    missing,
    [],
    `Missing English translations:\n${missing.join("\n")}`,
  );
});

test("changing locale updates domain labels and validation without changing macro content", () => {
  const previous = getLocale();
  const macro: Macro = {
    id: "user-macro",
    name: "用户宏 {0} $&",
    events: [{ type: "key", code: "KeyA", action: "down" }],
    loopMode: "once",
    repeatCount: 1,
  };
  try {
    setLocale("zh-CN");
    assert.equal(bindingLabel(dpiLockBinding(800)), "DPI 锁定 800");
    assert.equal(
      describeMacroEvent({ type: "delay", durationMs: 100 }),
      "等待 100 ms",
    );
    assert.throws(
      () => validateMacroEvent({ type: "wheel", direction: "invalid" }),
      /滚轮方向无效/,
    );
    const saved = serializeMacros([macro]);

    setLocale("en");
    assert.equal(bindingLabel(dpiLockBinding(800)), "DPI lock 800");
    assert.equal(bindingLabel({ type: 1, a1: 1, a2: 0 }), "Left button");
    assert.equal(
      describeMacroEvent({ type: "delay", durationMs: 100 }),
      "Wait 100 ms",
    );
    assert.equal(
      describeMacroEvent({ type: "wheel", direction: "up" }),
      "Wheel · Up",
    );
    assert.equal(
      describeMacroEvent({ type: "key", code: "KeyA", action: "down" }),
      "KeyA · Press",
    );
    assert.throws(
      () => validateMacroEvent({ type: "wheel", direction: "invalid" }),
      /Invalid wheel direction/,
    );
    assert.throws(
      () => importFusionCsv("invalid"),
      /not a Pulsar Fusion macro CSV file/,
    );
    assert.deepEqual(parseMacros(saved), [macro]);
    assert.equal(serializeMacros([macro]), saved);
  } finally {
    setLocale(previous);
  }
});

test("locale subscribers react to changes and can unsubscribe", () => {
  const previous = getLocale();
  let notifications = 0;
  const unsubscribe = subscribeLocale(() => {
    notifications++;
  });
  try {
    const other = previous === "en" ? "zh-CN" : "en";
    setLocale(other);
    assert.equal(notifications, 1);
    setLocale(other);
    assert.equal(notifications, 1);
    unsubscribe();
    setLocale(previous);
    assert.equal(notifications, 1);
  } finally {
    unsubscribe();
    setLocale(previous);
  }
});

test("locale changes persist separately from drafts and survive unavailable storage", () => {
  const previous = getLocale();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const writes: [string, string][] = [];
  let description = "";
  const html = { lang: "" };
  const fakeWindow = {
    localStorage: {
      setItem: (key: string, value: string) => writes.push([key, value]),
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: html,
      querySelector: () => ({
        setAttribute: (_key: string, value: string) => {
          description = value;
        },
      }),
    },
  });
  try {
    setLocale("en");
    assert.equal(html.lang, "en");
    assert.match(description, /Browser configuration tool/);
    assert.deepEqual(writes, [["pulsar-locale-v1", "en"]]);
    Object.defineProperty(fakeWindow, "localStorage", {
      get() {
        throw new Error("Storage blocked");
      },
    });
    assert.doesNotThrow(() => setLocale("zh-CN"));
    assert.equal(getLocale(), "zh-CN");
    assert.equal(html.lang, "zh-CN");
    assert.match(description, /浏览器设备配置工具/);
  } finally {
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    setLocale(previous);
  }
});

import * as monaco from "monaco-editor/editor/editor.api";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";

import "monaco-editor/languages/definitions/cpp/register";
import "monaco-editor/languages/definitions/csharp/register";
import "monaco-editor/languages/definitions/css/register";
import "monaco-editor/languages/definitions/dockerfile/register";
import "monaco-editor/languages/definitions/go/register";
import "monaco-editor/languages/definitions/graphql/register";
import "monaco-editor/languages/definitions/hcl/register";
import "monaco-editor/languages/definitions/html/register";
import "monaco-editor/languages/definitions/ini/register";
import "monaco-editor/languages/definitions/java/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/kotlin/register";
import "monaco-editor/languages/definitions/lua/register";
import "monaco-editor/languages/definitions/markdown/register";
import "monaco-editor/languages/definitions/php/register";
import "monaco-editor/languages/definitions/python/register";
import "monaco-editor/languages/definitions/ruby/register";
import "monaco-editor/languages/definitions/rust/register";
import "monaco-editor/languages/definitions/scss/register";
import "monaco-editor/languages/definitions/shell/register";
import "monaco-editor/languages/definitions/sql/register";
import "monaco-editor/languages/definitions/swift/register";
import "monaco-editor/languages/definitions/typescript/register";
import "monaco-editor/languages/definitions/xml/register";
import "monaco-editor/languages/definitions/yaml/register";

export type MonacoApi = typeof monaco;

let environmentConfigured = false;

export function configureMonacoEnvironment(): MonacoApi {
  if (!environmentConfigured) {
    globalThis.MonacoEnvironment = {
      getWorker: () => new EditorWorker(),
    };
    environmentConfigured = true;
  }
  return monaco;
}

// Только для тестов (сторож позиционирования 14+, kidsPositioning.guard.test.ts): в код
// витрины не импортировать — тянет компилятор TypeScript.
import ts from 'typescript'

export type SourceTextField = 'body' | 'meta'

export interface SourceText {
  text: string
  line: number
  /** meta — title и description страницы и текст H1 (там «набор юного химика» запрещён). */
  field: SourceTextField
}

const META_KEYS = new Set(['title', 'description', 'metaTitle', 'metaDescription'])

/**
 * Тексты, которые может увидеть посетитель: строковые литералы, части шаблонных строк и
 * JSX-текст. Разбор через синтаксическое дерево TypeScript: комментарии пропускаются сами,
 * а текст рядом с `{…}` и строки атрибутов не теряются.
 */
export function visibleTexts(src: string, fileName = 'source.tsx'): SourceText[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, kind)
  const out: SourceText[] = []

  const fieldOf = (node: ts.Node): SourceTextField => {
    if (ts.isJsxText(node)) {
      const el = node.parent
      return ts.isJsxElement(el) && el.openingElement.tagName.getText(sf) === 'h1' ? 'meta' : 'body'
    }
    let p = node.parent
    while (p && (ts.isTemplateSpan(p) || ts.isTemplateExpression(p) || ts.isAsExpression(p))) {
      p = p.parent
    }
    if (p && ts.isPropertyAssignment(p) && META_KEYS.has(p.name.getText(sf))) return 'meta'
    if (p && ts.isVariableDeclaration(p) && /TITLE|DESCRIPTION/.test(p.name.getText(sf))) {
      return 'meta'
    }
    return 'body'
  }

  const push = (node: ts.Node, text: string) => {
    if (!text.trim()) return
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    out.push({ text, line, field: fieldOf(node) })
  }

  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) push(node, node.text)
    else if (ts.isTemplateExpression(node)) {
      push(node.head, node.head.text)
      for (const span of node.templateSpans) push(span.literal, span.literal.text)
    } else if (ts.isJsxText(node)) push(node, node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

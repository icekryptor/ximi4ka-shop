// Только для тестов (сторожа позиционирования 14+ в web и api): в код витрины и API не
// импортировать — тянет компилятор TypeScript.
import ts from 'typescript'

export type SourceTextField = 'body' | 'meta'

export interface SourceText {
  text: string
  line: number
  /** meta — title и description страницы и текст H1 (там «набор юного химика» запрещён). */
  field: SourceTextField
}

const META_KEYS = new Set(['title', 'description', 'metaTitle', 'metaDescription', 'name', 'h1'])

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

  // Текст литерала; цепочка «'…' + '…'» и шаблонная строка склеиваются целиком (выражение
  // `${…}` становится пробелом), чтобы фраза, разбитая на куски, не ускользала от проверки.
  // null — в цепочке есть не-литерал: тогда каждый литерал проверяется отдельно.
  const literalText = (node: ts.Node): string | null => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isTemplateExpression(node)) {
      return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ')
    }
    if (ts.isParenthesizedExpression(node)) return literalText(node.expression)
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = literalText(node.left)
      const right = left === null ? null : literalText(node.right)
      return left === null || right === null ? null : left + right
    }
    return null
  }

  const visit = (node: ts.Node) => {
    const text = literalText(node)
    if (text !== null) {
      push(node, text)
      if (!ts.isTemplateExpression(node)) return
    } else if (ts.isJsxText(node)) push(node, node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

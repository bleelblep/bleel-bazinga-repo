package com.bleelblep.livemarkdown

/** What a stretch of the message box should look like. */
internal enum class Kind { MARKER, BOLD, ITALIC, UNDERLINE, STRIKE, SPOILER, CODE, LINK, H1, H2, H3, SUBTEXT, QUOTE }

internal class Run(val kind: Kind, val start: Int, val end: Int)

/**
 * A small parser for the markdown Discord renders, close enough to its own (simple-markdown based)
 * rules for a preview. It only reports ranges; nothing in the text is changed.
 *
 * Works on a masked copy: once something is claimed (an escape, code, a marker) its characters are
 * blanked to [MASK] so later rules can't match inside code or reuse a marker -- which is also how
 * `***both***` ends up bold and italic.
 */
internal object Markdown {
	private const val MASK = '\u0001'

	private val ESCAPE = Regex("""\\[*_~|`#>\[\]()\-\\]""")
	private val CODE_BLOCK = Regex("""```[\s\S]*?```""")
	private val INLINE_CODE = Regex("""``(?!`)[\s\S]+?``|`[^`]+`""")
	private val HEADING = Regex("""^(#{1,3}) (?=\S)""")
	private val SUBTEXT = Regex("""^-# (?=\S)""")
	private val BLOCK_QUOTE = Regex("""^>>> """)
	private val QUOTE = Regex("""^> """)
	private val LIST = Regex("""^\s*[-*] (?=\S)""")
	private val LINK = Regex("""\[([^\]\n]+)\]\((<?https?://[^)\s]+>?)\)""")

	/** Paired markers, in the order they're claimed. Group 1 is the content. */
	private val PAIRS = listOf(
		Kind.BOLD to Regex("""\*\*([\s\S]+?)\*\*(?!\*)"""),
		Kind.UNDERLINE to Regex("""__([\s\S]+?)__(?!_)"""),
		Kind.ITALIC to Regex("""\*(?=[^\s*])([^*]*?[^\s*])\*"""),
		Kind.ITALIC to Regex("""(?<![A-Za-z0-9_])_(?=[^\s_])([^_]*?[^\s_])_(?![A-Za-z0-9_])"""),
		Kind.STRIKE to Regex("""~~([\s\S]+?)~~"""),
		Kind.SPOILER to Regex("""\|\|([\s\S]+?)\|\|"""),
	)

	fun parse(text: String): List<Run> {
		val runs = ArrayList<Run>()
		val m = text.toCharArray()
		fun mask(a: Int, b: Int) { for (i in a until b) m[i] = MASK }
		fun masked() = String(m)

		for (e in ESCAPE.findAll(text)) {
			runs += Run(Kind.MARKER, e.range.first, e.range.first + 1)
			mask(e.range.first, e.range.last + 1)
		}

		for (c in CODE_BLOCK.findAll(masked())) {
			val a = c.range.first
			val b = c.range.last + 1
			runs += Run(Kind.CODE, a, b)
			runs += Run(Kind.MARKER, a, a + 3)
			runs += Run(Kind.MARKER, b - 3, b)
			mask(a, b)
		}
		for (c in INLINE_CODE.findAll(masked())) {
			val a = c.range.first
			val b = c.range.last + 1
			val fence = if (c.value.startsWith("``")) 2 else 1
			runs += Run(Kind.CODE, a, b)
			runs += Run(Kind.MARKER, a, a + fence)
			runs += Run(Kind.MARKER, b - fence, b)
			mask(a, b)
		}

		// Line rules. `>>>` quotes everything after it, so it ends the scan.
		var lineStart = 0
		var quoteAll = false
		val view = masked()
		while (lineStart <= view.length && !quoteAll) {
			val nl = view.indexOf('\n', lineStart).let { if (it < 0) view.length else it }
			val line = view.substring(lineStart, nl)
			HEADING.find(line)?.let { h ->
				val level = h.groupValues[1].length
				val markerEnd = lineStart + h.range.last + 1
				runs += Run(Kind.MARKER, lineStart, markerEnd)
				runs += Run(listOf(Kind.H1, Kind.H2, Kind.H3)[level - 1], markerEnd, nl)
				mask(lineStart, markerEnd)
			} ?: SUBTEXT.find(line)?.let { s ->
				val markerEnd = lineStart + s.range.last + 1
				runs += Run(Kind.MARKER, lineStart, markerEnd)
				runs += Run(Kind.SUBTEXT, markerEnd, nl)
				mask(lineStart, markerEnd)
			}
			BLOCK_QUOTE.find(line)?.let {
				runs += Run(Kind.QUOTE, lineStart, lineStart + 3)
				mask(lineStart, lineStart + 4)
				quoteAll = true
			} ?: QUOTE.find(line)?.let {
				runs += Run(Kind.QUOTE, lineStart, lineStart + 1)
				mask(lineStart, lineStart + 2)
			}
			LIST.find(line)?.let { l ->
				val markerEnd = lineStart + l.range.last + 1
				runs += Run(Kind.MARKER, lineStart, markerEnd)
				mask(lineStart, markerEnd)
			}
			lineStart = nl + 1
		}

		for (l in LINK.findAll(masked())) {
			val label = l.groups[1]!!.range
			val a = l.range.first
			val b = l.range.last + 1
			runs += Run(Kind.MARKER, a, label.first)
			runs += Run(Kind.LINK, label.first, label.last + 1)
			runs += Run(Kind.MARKER, label.last + 1, b)
			mask(a, label.first)
			mask(label.last + 1, b)
		}

		for ((kind, regex) in PAIRS) {
			for (p in regex.findAll(masked())) {
				val content = p.groups[1]!!.range
				val a = p.range.first
				val b = p.range.last + 1
				runs += Run(Kind.MARKER, a, content.first)
				runs += Run(Kind.MARKER, content.last + 1, b)
				runs += Run(kind, content.first, content.last + 1)
				mask(a, content.first)
				mask(content.last + 1, b)
			}
		}

		return runs.filter { it.start < it.end }
	}
}

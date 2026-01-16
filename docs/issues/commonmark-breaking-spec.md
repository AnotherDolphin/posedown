This is post that was meant as a GH issue on commonmark before 

# Issue Hypothesis

There is an issue where a string like:

`**bold* and *italic***`

is parsed as nested emphasis tags rather than the expected strong tag containing a literal asterisk. It is surprisingly ubiquitous and easily reproduceable in commonmark based contexts.

### To Reproduce
Here's a commonmark [dingus link](https://spec.commonmark.org/dingus/?text=**bold*%20and%20*italic***) to observe this.

Alternatively, you can visit [spec.commonmark.org/dingus](https://spec.commonmark.org/dingus/) and paste the same:

```markdown
**bold* and *italic***
```


### Observed Output
The preview tab shows "*bold and italic**" which is almost certainly _not_ how this string should parse.
<img width="1211" height="210" alt="Image" src="https://github.com/user-attachments/assets/4dcfc679-683b-44b5-a28c-6612b2e379c4" />

The parser produces nested `<em>` tags, treating the initial `**` as two consecutive openers:
<img width="1220" height="278" alt="Image" src="https://github.com/user-attachments/assets/14efbd26-ffa7-424b-81f3-d9e00b08b730" />

### Expected Output
The parser should produce a `<strong>` tag that wraps the first phrase and the italicized second phrase:
```html
<p><strong>bold* and <em>italic</em></strong></p>
```

I first encountered this while testing mid-of-sentence delimiter inputs for a markdown based editor I am working on, using [`mdast-util-to-hast`](https://github.com/syntax-tree/mdast-util-to-hast) 's `toHast()`. I quickly realized this kind of string misbehaves everywhere.

Even in VS Code .md file previews:
<img width="896" height="69" alt="Image" src="https://github.com/user-attachments/assets/18e5441c-23a0-415a-bf0a-ec6395f7764f" />

There seems to be a drift between the left side where VSCode clearly recognizes the `**` bold bracketing in preview, and the right side with the same odd parsed result.

### Specification Reference
This behavior appears to violate **Section 6.2 (Emphasis and Strong Emphasis)** of the CommonMark Spec.

**Link:** [https://spec.commonmark.org/current/#emphasis-and-strong-emphasis](https://spec.commonmark.org/current/#emphasis-and-strong-emphasis)

Rule 9 specifically states regarding delimiter matching:
> "If one of the delimiters can both open and close emphasis, then the sum of the lengths of the delimiter runs containing the opening and closing delimiters **must not be a multiple of 3 unless both lengths are multiples of 3**."

In this case:
1.  **Opener:** `**` (Length 2)
2.  **Potential Closer:** `*` (Length 1, immediately after "bold")
3.  **Sum:** 3

Because the sum is a multiple of 3, the single asterisk after "bold" should **not** be able to close the double asterisk opener. It should be skipped, leaving the `**` open until it finds the matching `**` at the end of the string.

### Environment
*   Verified in `commonmark.js` (via the official Dingus)
*   Verified in `mdast`/`micromark` parsing pipeline

# Correction

## The Issue
When converting the specific string `**bold* and *italic***` using a CommonMark-compliant parser (like `mdast`, `markdown-it`, or the VS Code preview), the output renders as **nested italics** rather than **bold text containing a literal asterisk**.

### Input
```markdown
**bold* and *italic***
```

### Expected Behavior (Intuitive)
One might expect the parser to recognize the `**` as a Strong (Bold) tag that contains a literal asterisk within the text.
*   **Target HTML:** `<strong>bold* and <em>italic</em></strong>`
*   **Visual:** **bold* and *italic***

### Actual Behavior (Spec Compliant)
The parser treats the initial `**` as two consecutive emphasis openers, resulting in a nested structure with a trailing literal asterisk.
*   **Actual HTML:** `<em><em>bold</em> and <em>italic</em></em>*`
*   **Visual:** *bold and italic\**

---

## Technical Explanation

This behavior is **not a bug**; it is the strict application of the [CommonMark Specification](https://spec.commonmark.org/current/#emphasis-and-strong-emphasis).

### The "Rule of 3" Exception
CommonMark has a specific rule (Rule 16) designed to prevent ambiguity when delimiter lengths don't match (e.g., a length-1 closer closing a length-2 opener).

> **The Rule:** "If one of the delimiters can **both open and close** emphasis, then the sum of the lengths of the delimiter runs... must not be a multiple of 3."

If this rule applied, the parser would force the single `*` after "bold" to be ignored, resulting in the desired Bold output.

### Why the Rule Doesn't Apply
For the rule to trigger, **one** of the delimiters must be able to **both** open and close emphasis.
1.  **The Opener (`**`):** Located at the start of the line. It is left-flanking (can open) but **not** right-flanking (cannot close).
2.  **The Closer (`*`):** Located after "bold" and followed by a space. It is right-flanking (can close) but **not** left-flanking (cannot open).

Because neither delimiter meets the "both open and close" criteria, **the exclusion rule is skipped.**

### The Resulting Logic
1.  The parser allows the single `*` (after "bold") to match with the double `**` (at the start).
2.  It consumes 1 asterisk from the start and 1 from the middle to create an `<em>` pair.
3.  The remaining asterisk from the start pairs with one of the asterisks at the end, creating a second (nested) `<em>` pair.

## Solution

To achieve the desired output (Bold text with a literal asterisk inside), you must **escape the internal asterisk**. This tells the parser explicitly not to treat it as a delimiter.

**Correct Syntax:**
```markdown
**bold\* and *italic***
```

**Output:**
**bold* and *italic***
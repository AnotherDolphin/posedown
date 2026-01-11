### main test string
`This is **bold and italic** text` is rendered as `<p>This is <strong>bold and italic</strong> text</p>` in HTML. The cases described below show focusMarks as they would be rendered in HTML when in focus.

#### case
`This is bold and *italic|* text`
- input: **Del**
  - unwrapping and formatting works
  - caret wrongly set to start of word: `|italic`
  - focusMarks (`**`) of newly focused `strong` node are not shown

#### case
`This is bold and *italic*| text`
- input: **Backspace**
  - unwrapping and formatting works
  - caret wrongly set to start of sentence: `**|bold and ...`
  - focusMarks of newly focused `strong` node is shown correctly

#### case
`**|This is bold and italic text**`
- input: **Backpace**
  - wrongly removes both `**` marks from both ends with one backspace
  - unwrapping does work (though it should only unwrap one \*)
  - cursor at correct position

#### case
`*|*This is bold and italic text**`
- input: **Del**
  - correctly removes one `*` on each end
  - unwraps and transforms whole sentece to italic correctly
  - cursor at correct position
  - focusMarks (`*`) of newly created `italic` node not shown
- input: **Backspace**
  - correctly removes one `*` on each end
  - unwraps and transforms whole sentece to italic correctly
  - cursor at correct position
  - focusMarks (`*`) of newly created `italic` node not shown

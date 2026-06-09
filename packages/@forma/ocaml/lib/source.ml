type origin =
  | Direct
  | MarkdownFence of {
      file_id : string;
      block_index : int;
      block_start_offset : int;
      block_start_line : int;
      block_start_column : int;
    }

type t = {
  id : string;
  text : string;
  origin : origin;
  line_starts : int array;
}

type position = { line : int; column : int }

let line_starts text =
  let starts = ref [ 0 ] in
  String.iteri
    (fun index char -> if char = '\n' then starts := (index + 1) :: !starts)
    text;
  Array.of_list (List.rev !starts)

let make ?(origin = Direct) ~id ~text () =
  { id; text; origin; line_starts = line_starts text }

let id source = source.id
let text source = source.text
let origin source = source.origin
let clamp_offset source offset = max 0 (min offset (String.length source.text))

let rec upper_bound array value low high =
  if low >= high then low
  else
    let mid = low + ((high - low) / 2) in
    if array.(mid) <= value then upper_bound array value (mid + 1) high
    else upper_bound array value low mid

let direct_position_at_offset source offset =
  let offset = clamp_offset source offset in
  let line_index =
    max 0
      (upper_bound source.line_starts offset 0 (Array.length source.line_starts)
      - 1)
  in
  {
    line = line_index + 1;
    column = offset - source.line_starts.(line_index) + 1;
  }

let position_at_offset source offset =
  let position = direct_position_at_offset source offset in
  match source.origin with
  | Direct -> position
  | MarkdownFence { block_start_line; block_start_column; _ } ->
      if position.line = 1 then
        {
          line = block_start_line;
          column = block_start_column + position.column - 1;
        }
      else
        {
          line = block_start_line + position.line - 1;
          column = position.column;
        }

let hash source = Digest.to_hex (Digest.string source.text)

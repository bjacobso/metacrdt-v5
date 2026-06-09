type origin =
  | Direct
  | MarkdownFence of {
      file_id : string;
      block_index : int;
      block_start_offset : int;
      block_start_line : int;
      block_start_column : int;
    }

type t
type position = { line : int; column : int }

val make : ?origin:origin -> id:string -> text:string -> unit -> t
val id : t -> string
val text : t -> string
val origin : t -> origin
val position_at_offset : t -> int -> position
val hash : t -> string

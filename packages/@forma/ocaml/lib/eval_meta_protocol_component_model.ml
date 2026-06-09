type slot_compile_kind = Expr | Json | NodeList | Value

type slot_compile_mechanism_config = {
  json_mechanism : string;
  value_mechanism : string;
  expr_mechanism : string;
  node_list_mechanism : string;
}

type name_normalization = Preserve | CamelCase
type slot_compile_spec = { field : string; kind : slot_compile_kind }

type children_policy =
  | Any_children
  | No_children
  | Only_children of string list

type component_protocol = {
  type_field : string;
  props_field : string;
  events_field : string;
  children_field : string;
  bind_prop : string;
  required_bind_value : Value.t;
  scalar_fallback_field : string;
  scalar_fallback_kind : slot_compile_kind;
  fallback_prop_kind : slot_compile_kind;
  prop_name_normalization : name_normalization;
}

type prop_resolution =
  | Event_field of string
  | Slot of slot_compile_spec
  | Expr_prop of string
  | Fallback_prop of slot_compile_spec

type component_spec = {
  type_field : string option;
  slots : (string * slot_compile_spec) list;
  aliases : (string * string) list;
  events : (string * string) list;
  allows_bind : bool;
  children_policy : children_policy option;
  parents : string list;
  required_children : bool;
  required_bind : bool;
  events_field : string option;
  props_field : string option;
  children_field : string option;
  positional_prop : string option;
  expr_props : string list;
  unknown_props_kind : slot_compile_kind option;
}

type node_shape = {
  type_field_key : string;
  props_section_key : string;
  events_section_key : string;
  children_section_key : string;
  scalar_fallback_slot : slot_compile_spec;
  required_bind_slot : slot_compile_spec option;
  required_bind_value : Value.t option;
}

type resolved_component = {
  component_type : string;
  spec : component_spec option;
  shape : node_shape;
  positional_slot : slot_compile_spec option;
  scalar_slots : slot_compile_spec list;
  requires_children : bool;
}

type component_registry = {
  protocol : component_protocol;
  specs : (string * component_spec) list;
}

type component_item =
  | Scalar_item of Value.t
  | Prop_entries_item of (string * Value.t) list
  | Child_item of Value.t
  | Ignored_item

let lookup_assoc entries key = List.assoc_opt key entries
let scalar_string = Eval_slot.scalar_string

let normalize_name name =
  if String.length name > 0 && name.[0] = ':' then
    String.sub name 1 (String.length name - 1)
  else name

let field key value = (Value.VKeyword (":" ^ key), value)
let object_value entries = Value.VMap entries

let value_list = function
  | Value.VList values | Value.VVector values -> Some values
  | _ -> None

let keyword_form = function
  | Value.VList (head :: _) | Value.VVector (head :: _) -> (
      match scalar_string head with
      | Some name -> String.length name > 0 && name.[0] = ':'
      | None -> false)
  | _ -> false

let slot_compile_kind_of_mechanism config = function
  | mechanism when mechanism = config.json_mechanism -> Some Json
  | mechanism when mechanism = config.value_mechanism -> Some Value
  | mechanism when mechanism = config.expr_mechanism -> Some Expr
  | mechanism when mechanism = config.node_list_mechanism -> Some NodeList
  | _ -> None

let name_normalization_of_mechanism = function
  | "preserve" -> Some Preserve
  | "camel-case" -> Some CamelCase
  | _ -> None

let to_camel_case value =
  let buffer = Buffer.create (String.length value) in
  let rec loop uppercase = function
    | [] -> Buffer.contents buffer
    | '-' :: rest -> loop true rest
    | char :: rest ->
        Buffer.add_char buffer
          (if uppercase then Char.uppercase_ascii char else char);
        loop false rest
  in
  loop false (List.init (String.length value) (String.get value))

let normalize_key normalization value =
  match normalization with
  | Preserve -> value
  | CamelCase -> to_camel_case value

let event_field (spec : component_spec) raw_key =
  lookup_assoc spec.events raw_key

let resolve_slot (protocol : component_protocol) (spec : component_spec) raw_key
    =
  let normalized_key = normalize_key protocol.prop_name_normalization raw_key in
  let canonical =
    Option.value ~default:normalized_key
      (lookup_assoc spec.aliases normalized_key)
  in
  lookup_assoc spec.slots canonical

let expr_prop_key (protocol : component_protocol) (spec : component_spec)
    raw_key =
  let normalized_key = normalize_key protocol.prop_name_normalization raw_key in
  if List.mem normalized_key spec.expr_props then Some normalized_key else None

let bind_field_key (protocol : component_protocol) (spec : component_spec) =
  if spec.allows_bind then expr_prop_key protocol spec protocol.bind_prop
  else None

let fallback_prop_kind protocol (spec : component_spec) =
  Option.value ~default:protocol.fallback_prop_kind spec.unknown_props_kind

let fallback_prop (protocol : component_protocol) (spec : component_spec)
    raw_key =
  {
    field = normalize_key protocol.prop_name_normalization raw_key;
    kind = fallback_prop_kind protocol spec;
  }

let resolve_prop (protocol : component_protocol) (spec : component_spec) raw_key
    =
  match event_field spec raw_key with
  | Some field -> Event_field field
  | None -> (
      match resolve_slot protocol spec raw_key with
      | Some slot -> Slot slot
      | None -> (
          match expr_prop_key protocol spec raw_key with
          | Some field -> Expr_prop field
          | None -> Fallback_prop (fallback_prop protocol spec raw_key)))

let resolve_prop_for (protocol : component_protocol) spec raw_key =
  match spec with
  | Some spec -> resolve_prop protocol spec raw_key
  | None ->
      Fallback_prop
        {
          field = normalize_key protocol.prop_name_normalization raw_key;
          kind = protocol.fallback_prop_kind;
        }

let section_key default key_of_spec = function
  | Some spec -> Option.value ~default (key_of_spec spec)
  | None -> default

let type_field_key (protocol : component_protocol) =
  section_key protocol.type_field (fun spec -> spec.type_field)

let props_field_key (protocol : component_protocol) =
  section_key protocol.props_field (fun spec -> spec.props_field)

let events_field_key (protocol : component_protocol) =
  section_key protocol.events_field (fun spec -> spec.events_field)

let children_field_key (protocol : component_protocol) =
  section_key protocol.children_field (fun spec -> spec.children_field)

let allows_child (spec : component_spec) child_type =
  match spec.children_policy with
  | None | Some Any_children -> true
  | Some No_children -> false
  | Some (Only_children allowed_types) -> List.mem child_type allowed_types

let allows_parent (spec : component_spec) parent_type =
  spec.parents = [] || List.mem parent_type spec.parents

let resolve_positional_slot (protocol : component_protocol)
    (spec : component_spec) =
  match spec.positional_prop with
  | Some positional_prop -> resolve_slot protocol spec positional_prop
  | None -> None

let resolve_positional_slot_for protocol = function
  | Some spec -> resolve_positional_slot protocol spec
  | None -> None

let node_shape_for (protocol : component_protocol) spec =
  {
    type_field_key = type_field_key protocol spec;
    props_section_key = props_field_key protocol spec;
    events_section_key = events_field_key protocol spec;
    children_section_key = children_field_key protocol spec;
    scalar_fallback_slot =
      {
        field = protocol.scalar_fallback_field;
        kind = protocol.scalar_fallback_kind;
      };
    required_bind_slot =
      Option.bind spec (fun spec ->
          if spec.required_bind then bind_field_key protocol spec else None)
      |> Option.map (fun field -> { field; kind = Expr });
    required_bind_value =
      Option.bind spec (fun spec ->
          if spec.required_bind then Some protocol.required_bind_value else None);
  }

let resolve_component (registry : component_registry) parent_type component_type
    =
  let protocol = registry.protocol in
  let spec = lookup_assoc registry.specs component_type in
  if
    match (parent_type, spec) with
    | Some parent_type, Some spec -> allows_parent spec parent_type
    | _ -> true
  then
    let shape = node_shape_for protocol spec in
    let positional_slot = resolve_positional_slot_for protocol spec in
    Some
      {
        component_type;
        spec;
        shape;
        positional_slot;
        scalar_slots =
          (match positional_slot with
          | Some slot -> [ slot; shape.scalar_fallback_slot ]
          | None -> [ shape.scalar_fallback_slot ]);
        requires_children =
          (match spec with
          | Some spec -> spec.required_children
          | None -> false);
      }
  else None

let component_name_of_head head =
  match scalar_string head |> Option.map normalize_name with
  | Some raw_head when not (String.length raw_head > 0 && raw_head.[0] = ':') ->
      Some raw_head
  | _ -> None

let resolve_component_head (registry : component_registry) parent_type head =
  Option.bind
    (component_name_of_head head)
    (resolve_component registry parent_type)

let resolve_prop_for_component (registry : component_registry)
    (component : resolved_component) raw_key =
  resolve_prop_for registry.protocol component.spec raw_key

let allows_child_for_component (component : resolved_component) child_type =
  match component.spec with
  | None -> true
  | Some spec -> allows_child spec child_type

let component_type_of_resolved (component : resolved_component) =
  component.component_type

let scalar_slots_for_component (component : resolved_component) =
  component.scalar_slots

let child_entries_satisfy (component : resolved_component) child_entries =
  (not component.requires_children) || child_entries <> []

let normalized_prop_entries entries =
  List.filter_map
    (fun (key, value) ->
      match Eval_meta_util.key_string key with
      | Some key -> Some (key, value)
      | None -> None)
    entries

let classify_component_item item =
  match item with
  | ( Value.VString _ | Value.VInt _ | Value.VFloat _ | Value.VBool _
    | Value.VKeyword _ | Value.VSymbol _ ) as item ->
      Scalar_item item
  | Value.VMap entries -> Prop_entries_item (normalized_prop_entries entries)
  | (Value.VList _ | Value.VVector _) as item when keyword_form item -> (
      match value_list item with
      | Some (head :: [ value ]) -> (
          match scalar_string head |> Option.map normalize_name with
          | Some key -> Prop_entries_item [ (key, value) ]
          | None -> Ignored_item)
      | _ -> Ignored_item)
  | (Value.VList _ | Value.VVector _) as item -> Child_item item
  | _ -> Ignored_item

let classify_component_items items = List.map classify_component_item items

let initial_node_entries (component : resolved_component) =
  [
    field component.shape.type_field_key
      (Value.VString component.component_type);
  ]

let prepend_object_section section_key entries node =
  if entries = [] then node
  else field section_key (object_value (List.rev entries)) :: node

let prepend_list_section section_key entries node =
  if entries = [] then node
  else field section_key (Value.VList (List.rev entries)) :: node

let node_has_field node field_name =
  List.exists (fun (key, _) -> key = Value.VKeyword (":" ^ field_name)) node

let required_bind_entry compile_required_value (component : resolved_component)
    node_entries =
  match
    (component.shape.required_bind_slot, component.shape.required_bind_value)
  with
  | Some bind_slot, Some required_bind_value
    when not (node_has_field node_entries bind_slot.field) ->
      Some (field bind_slot.field (compile_required_value required_bind_value))
  | _ -> None

let node_entries_with_required_bind compile_required_value
    (component : resolved_component) node_entries =
  match required_bind_entry compile_required_value component node_entries with
  | Some bind_entry -> bind_entry :: node_entries
  | None -> node_entries

let assembled_node_entries (component : resolved_component) ~node_entries
    ~prop_entries ~event_entries ~child_entries =
  node_entries
  |> prepend_object_section component.shape.props_section_key prop_entries
  |> prepend_object_section component.shape.events_section_key event_entries
  |> prepend_list_section component.shape.children_section_key child_entries

let finalized_node_entries compile_required_value
    (component : resolved_component) ~node_entries ~prop_entries ~event_entries
    ~child_entries =
  assembled_node_entries component
    ~node_entries:
      (node_entries_with_required_bind compile_required_value component
         node_entries)
    ~prop_entries ~event_entries ~child_entries

let compiled_node_value entries = object_value (List.rev entries)

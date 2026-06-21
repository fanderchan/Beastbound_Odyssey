# Phase 19: Battle Item Counts

## Goal

Add a minimal local item-count layer to the Phase 18 battle item menu.

This is still not a full inventory system. Counts currently live inside the local battle state so the command loop can be tested before account, bag, save, Node.js, or MySQL authority exists.

## Implemented Behavior

- A new battle starts with two of each test item:
  - `群体草药5 x2`
  - `回复药5 x2`
  - `毒粉5 x2`
  - `毒雾粉5 x2`
- The `物品` menu displays item counts in the button label.
- When an item event successfully applies, the count decreases by 1.
- A count of `0` disables that item button.
- If an item has no count left, no item battle event is generated.

## Validation

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-item-count-check
```

The check confirms:

- the item menu opens;
- labels include the current count;
- using `群体草药5` consumes one count;
- after forcing its count to `0`, the button is disabled.

## Deferred

- World inventory and bag UI.
- Item stack limits and sorting.
- Consume-on-use rollback if the future server rejects the action.
- Database-backed persistence.

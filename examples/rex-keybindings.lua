-- Required for native OpenLogi profiles; also usable with Options+ shortcuts.
-- Merge into your existing Rex init.lua and reload Rex config.
-- Assign these same Command+Control+Option+F-key chords in your device's Rex profile.
-- Existing Rex bindings for these chords will be replaced; normal F-keys are unchanged.
rex.bind("cmd+ctrl+alt+f1", "client.palette.toggle")
rex.bind("cmd+ctrl+alt+f2", "client.tab.new")
rex.bind("cmd+ctrl+alt+f3", "client.tab.previous")
rex.bind("cmd+ctrl+alt+f4", "client.tab.next")
rex.bind("cmd+ctrl+alt+f5", "pane.focus", { direction = "left" })
rex.bind("cmd+ctrl+alt+f6", "pane.focus", { direction = "right" })
rex.bind("cmd+ctrl+alt+f7", "pane.focus", { direction = "up" })
rex.bind("cmd+ctrl+alt+f8", "pane.focus", { direction = "down" })
rex.bind("cmd+ctrl+alt+f9", "pane.zoom")
rex.bind("cmd+ctrl+alt+f10", "pane.split", { direction = "right" })
rex.bind("cmd+ctrl+alt+f11", "session.previous")
rex.bind("cmd+ctrl+alt+f12", "session.next")
rex.bind("cmd+ctrl+alt+shift+f1", "session.switch")
rex.bind("cmd+ctrl+alt+shift+f3", "pane.focus_previous")
rex.bind("cmd+ctrl+alt+shift+f4", "pane.focus_next")

param(
    [string]$StartDir = (Get-Location).Path
)

if (-not (Test-Path -LiteralPath $StartDir)) {
    $StartDir = (Get-Location).Path
}
$StartDir = (Resolve-Path -LiteralPath $StartDir).Path

# One Windows Terminal window, four panes in a 2x2 layout.
# Single Alt+Tab entry. Move between agents inside the window with
# Alt+Shift+Arrow (default WT pane-navigation binding).
#
#   +---------+---------+
#   | claude  | gemini  |
#   +---------+---------+
#   | agy     | codex   |
#   +---------+---------+
#
# Build sequence:
#   1. new-tab            -> claude fills the tab
#   2. split-pane -V      -> vertical split, gemini on the right
#   3. move-focus left    -> back to claude
#   4. split-pane -H      -> horizontal split under claude, agy below
#   5. move-focus right   -> back to gemini
#   6. split-pane -H      -> horizontal split under gemini, codex below

function Pane([string]$Name) {
    # cmd /k keeps the pane open after the agent exits, so a crash doesn't
    # close the pane and break the layout.
    return @('cmd.exe', '/k', "title Agent-$Name && $Name")
}

$wtArgs = @(
    '-w', 'new', '--maximized', 'new-tab',
        '--title', 'Agent-claude',
        '--startingDirectory', $StartDir
) + (Pane 'claude') + @(
    ';', 'split-pane', '-V',
        '--title', 'Agent-gemini',
        '--startingDirectory', $StartDir
) + (Pane 'gemini') + @(
    ';', 'move-focus', 'left',
    ';', 'split-pane', '-H',
        '--title', 'Agent-agy',
        '--startingDirectory', $StartDir
) + (Pane 'agy') + @(
    ';', 'move-focus', 'right',
    ';', 'split-pane', '-H',
        '--title', 'Agent-codex',
        '--startingDirectory', $StartDir
) + (Pane 'codex')

Start-Process -FilePath 'wt.exe' -ArgumentList $wtArgs

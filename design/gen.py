import json
PURPLE=[("alexis","Alexis Levine"),("ana","Ana Sani"),("carter","Carter Krull"),("cristian","Cristian Chavez"),("eric","Eric Macksoud"),("kristin","Kristin Flickinger"),("linnea","Linnea Capobianco"),("ori","Ori Jean-Charles"),("rob","Rob Antonson"),("sharonda","Sharonda Cox")]
YELLOW=[("aaliyah","Aaliyah Puglia"),("thienan","Thien An Nguyen"),("jelly","Angelica \"Jelly\" Loblack"),("brady","Brady Booker"),("danny","Danny Kilby"),("devin","Devin Way"),("jenna","Jenna Doore"),("lewis","Lewis Kelly"),("maggie","Maggie Nestor"),("mike","Mike Pinsky"),("patt","Patt Cannaday")]
ALL=PURPLE+YELLOW
HEAD='''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    body { margin: 0; background: #0f1a14; color: #eef3ee; font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    a { color: #ffb347; } a:hover { color: #f0882a; }
  </style>
</helmet>'''
def nav(active):
    tabs=[]
    for t in ["Picks","Leaderboard","Episodes","Admin"]:
        if t==active: tabs.append(f'    <div style="padding: 9px 9px; font-size: 14px; color: #eef3ee; border-bottom: 3px solid #f0882a; margin-bottom: -1px;">{t}</div>')
        else: tabs.append(f'    <div style="padding: 9px 9px; font-size: 14px; color: #9db3a4;">{t}</div>')
    return '''  <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 16px 8px; gap: 12px;">
    <div style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 24px;">🔥</span><div style="font-size: 22px; font-weight: 700; line-height: 1.2;">Survivor 51</div></div>
    <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: #9db3a4;"><span>Playing as <b style="color: #eef3ee;">Conor</b></span><div style="background: #213629; color: #eef3ee; border: 1px solid #2f4a3a; padding: 6px 10px; border-radius: 8px; font-size: 13px; font-weight: 600;">Switch</div></div>
  </div>
  <div style="display: flex; gap: 4px; padding: 0 16px; border-bottom: 1px solid #2f4a3a;">
'''+"\n".join(tabs)+'''
  </div>'''
CHECK='<svg viewBox="0 0 20 20" width="14" height="14" style="display: block;"><path d="M4 10.5l4 4 8-8" style="stroke: #1a1005; stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round;"></path></svg>'
def cell(key,id,name,cols,badge_text):
    # key = binding prefix e.g. "c" or "t"
    b=f"{key}.{id}"
    if cols==3:
        namebox=f'<div style="font-size: 12.5px; line-height: 1.2; text-align: center; height: 30px; display: flex; align-items: flex-end; justify-content: center; color: {{{{ {b}.nameColor }}}}; font-weight: {{{{ {b}.weight }}}};">{name}</div>'
        photo=f'aspect-ratio: 3 / 4;'
    else:
        first=name.split('"')[1] if '"' in name else name.split(' ')[0]
        namebox=f'<div style="font-size: 12px; line-height: 1.2; text-align: center; color: {{{{ {b}.nameColor }}}}; font-weight: {{{{ {b}.weight }}}};">{first}</div>'
        photo=f'aspect-ratio: 1 / 1;'
    inner = CHECK if badge_text is None else f'{{{{ {b}.badge }}}}'
    return f'''<div onClick="{{{{ {b}.pick }}}}" style="display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer;">
  {namebox}
  <div style="position: relative; width: 100%; {photo} border-radius: 8px; overflow: hidden; border: 3px solid {{{{ {b}.ring }}}}; box-sizing: border-box; background: #213629;">
    <img src="{id}.jpg" alt="" style="width: 100%; height: 100%; object-fit: cover; object-position: top; display: block;" />
    <div style="position: absolute; right: 4px; bottom: 4px; width: 22px; height: 22px; border-radius: 50%; background: #f0882a; color: #1a1005; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; opacity: {{{{ {b}.badgeOpacity }}}};">{inner}</div>
  </div>
</div>'''
def grid(key,people,cols,badge_text=None):
    cells="\n".join(cell(key,i,n,cols,badge_text) for i,n in people)
    return f'<div style="display: grid; grid-template-columns: repeat({cols}, minmax(0, 1fr)); gap: 10px 8px;">\n{cells}\n</div>'
CARD='background: #182a20; border: 1px solid #2f4a3a; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px;'
BTN='font: inherit; background: #f0882a; color: #1a1005; border: none; padding: 12px 18px; border-radius: 8px; font-weight: 600; min-height: 44px; cursor: pointer;'
def dot(c): return f'<span style="display: inline-block; width: 11px; height: 11px; border-radius: 50%; background: {c};"></span>'
def logic_common():
    return '''
  cellVals(selected, id, badge) {
    const on = selected;
    return { ring: on ? "#f0882a" : "#2f4a3a", nameColor: on ? "#ffb347" : "#eef3ee", weight: on ? 700 : 400, badgeOpacity: on ? 1 : 0, badge: badge || "" };
  }'''
ids_js=json.dumps([i for i,_ in ALL])

# ---------------- Main (pre-merge)
main = HEAD + '\n<div style="width: 390px; min-height: 844px; background: #0f1a14; display: flex; flex-direction: column;">\n' + nav("Picks") + f'''
  <div style="padding: 16px; display: flex; flex-direction: column; gap: 16px;">
    <div style="{CARD}">
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="font-size: 20px; font-weight: 700; line-height: 1.2;">Episode 1: Permanent Uncertainty</div>
        <div style="align-self: flex-start; padding: 2px 8px; border-radius: 999px; font-size: 12.5px; background: #213629; border: 1px solid #2f4a3a; color: #9db3a4;">Pre-merge (one pick per tribe)</div>
      </div>
      <div style="font-size: 17px;">Picks close <b style="color: #ffb347;">Wed, Sep 23, 8:00 PM</b> (in 11d 0h)</div>
    </div>
    <div style="{CARD}">
      <div style="font-size: 17px; font-weight: 700; color: #ffb347; display: flex; align-items: center; gap: 6px;">{dot("#8e4fd1")}Purple Tribe — who goes home?</div>
      <div style="font-size: 13.5px; color: #9db3a4;">Tap a castaway. Tap again to clear.</div>
      {grid("c", PURPLE, 3)}
    </div>
    <div style="{CARD}">
      <div style="font-size: 17px; font-weight: 700; color: #ffb347; display: flex; align-items: center; gap: 6px;">{dot("#f2c12e")}Yellow Tribe — who goes home?</div>
      <div style="font-size: 13.5px; color: #9db3a4;">Tap a castaway. Tap again to clear.</div>
      {grid("c", YELLOW, 3)}
    </div>
    <div style="{CARD}">
      <div style="font-size: 17px; font-weight: 700; color: #ffb347;">Title bonus (+5): who says the line that becomes the episode title?</div>
      <div style="color: #9db3a4; font-size: 15px;">This episode is called <b style="color: #eef3ee;">“Permanent Uncertainty”</b>. Optional.</div>
      {grid("t", ALL, 4)}
    </div>
    <div style="{CARD}">
      <div style="font-size: 15px; color: #9db3a4;">{{{{ summary }}}}</div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <button onClick="{{{{ submit }}}}" style="{BTN}">{{{{ buttonLabel }}}}</button>
      </div>
      <div style="min-height: 20px; color: {{{{ statusColor }}}}; font-size: 15px;">{{{{ status }}}}</div>
    </div>
  </div>
</div>
</x-dc>
<script data-dc-script data-props='{{"$preview":{{"width":390,"height":2600}}}}'>
class Component extends DCLogic {{
  constructor(props) {{ super(props); this.state = {{ purple: "", yellow: "", title: "", saved: false, status: "", statusColor: "#9db3a4" }}; }}{logic_common()}
  renderVals() {{
    const PURPLE = {json.dumps([i for i,_ in PURPLE])}, YELLOW = {json.dumps([i for i,_ in YELLOW])};
    const NAMES = {json.dumps(dict(ALL))};
    const s = this.state, c = {{}}, t = {{}};
    for (const id of PURPLE) c[id] = Object.assign(this.cellVals(s.purple === id, id), {{ pick: () => this.setState({{ purple: s.purple === id ? "" : id, status: "" }}) }});
    for (const id of YELLOW) c[id] = Object.assign(this.cellVals(s.yellow === id, id), {{ pick: () => this.setState({{ yellow: s.yellow === id ? "" : id, status: "" }}) }});
    for (const id of PURPLE.concat(YELLOW)) t[id] = Object.assign(this.cellVals(s.title === id, id), {{ pick: () => this.setState({{ title: s.title === id ? "" : id, status: "" }}) }});
    const parts = [];
    parts.push("Purple: " + (s.purple ? NAMES[s.purple] : "no pick"));
    parts.push("Yellow: " + (s.yellow ? NAMES[s.yellow] : "no pick"));
    parts.push("Title line: " + (s.title ? NAMES[s.title] : "skipped"));
    return {{
      c, t, summary: parts.join(" · "), status: s.status, statusColor: s.statusColor,
      buttonLabel: s.saved ? "Update picks" : "Submit picks",
      submit: () => {{
        if (!s.purple && !s.yellow) {{ this.setState({{ status: "Pick at least one castaway.", statusColor: "#e25c5c" }}); return; }}
        this.setState({{ saved: true, status: "Saved. Good luck!", statusColor: "#4fd17a" }});
      }},
    }};
  }}
}}
</script>
</body>
</html>
'''
open("Main.dc.html","w").write(main)

# ---------------- PostMerge
ALIVE=[p for p in ALL if p[0] in ("alexis","carter","cristian","kristin","ori","sharonda","aaliyah","jelly","brady","devin","jenna","maggie","mike")]
post = HEAD + '\n<div style="width: 390px; min-height: 844px; background: #0f1a14; display: flex; flex-direction: column;">\n' + nav("Picks") + f'''
  <div style="padding: 16px; display: flex; flex-direction: column; gap: 16px;">
    <div style="{CARD}">
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="font-size: 20px; font-weight: 700; line-height: 1.2;">Episode 9: TBA</div>
        <div style="align-self: flex-start; padding: 2px 8px; border-radius: 999px; font-size: 12.5px; background: #213629; border: 1px solid #2f4a3a; color: #9db3a4;">Post-merge (rank 3 boots)</div>
      </div>
      <div style="font-size: 17px;">Picks close <b style="color: #ffb347;">Wed, Nov 18, 8:00 PM</b> (in 2d 3h)</div>
    </div>
    <div style="{CARD}">
      <div style="font-size: 17px; font-weight: 700; color: #ffb347;">Who goes home? Rank your top 3.</div>
      <div style="font-size: 13.5px; color: #9db3a4;">Tap in order: first tap is #1 (150 pts), then #2 (75), then #3 (40). Tap a pick again to remove it.</div>
      {grid("c", ALIVE, 3, badge_text="rank")}
    </div>
    <div style="{CARD}">
      <div style="font-size: 17px; font-weight: 700; color: #ffb347;">Title bonus (+5): who says the line that becomes the episode title?</div>
      <div style="color: #9db3a4; font-size: 15px;">Title not announced yet. Optional.</div>
      {grid("t", ALIVE, 4)}
    </div>
    <div style="{CARD}">
      <div style="font-size: 15px; color: #9db3a4;">{{{{ summary }}}}</div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <button onClick="{{{{ submit }}}}" style="{BTN}">{{{{ buttonLabel }}}}</button>
      </div>
      <div style="min-height: 20px; color: {{{{ statusColor }}}}; font-size: 15px;">{{{{ status }}}}</div>
    </div>
  </div>
</div>
</x-dc>
<script data-dc-script data-props='{{"$preview":{{"width":390,"height":1750}}}}'>
class Component extends DCLogic {{
  constructor(props) {{ super(props); this.state = {{ ranks: [], title: "", saved: false, status: "", statusColor: "#9db3a4" }}; }}{logic_common()}
  renderVals() {{
    const ALIVE = {json.dumps([i for i,_ in ALIVE])};
    const NAMES = {json.dumps(dict(ALIVE))};
    const s = this.state, c = {{}}, t = {{}};
    for (const id of ALIVE) {{
      const pos = s.ranks.indexOf(id);
      c[id] = Object.assign(this.cellVals(pos >= 0, id, pos >= 0 ? String(pos + 1) : ""), {{ pick: () => {{
        let ranks = s.ranks.slice();
        if (pos >= 0) ranks.splice(pos, 1); else if (ranks.length < 3) ranks.push(id); else {{ this.setState({{ status: "You already have three. Tap one to remove it first.", statusColor: "#e25c5c" }}); return; }}
        this.setState({{ ranks, status: "" }});
      }} }});
      t[id] = Object.assign(this.cellVals(s.title === id, id), {{ pick: () => this.setState({{ title: s.title === id ? "" : id, status: "" }}) }});
    }}
    const summary = ["1st", "2nd", "3rd"].map((l, i) => l + ": " + (s.ranks[i] ? NAMES[s.ranks[i]] : "—")).join(" · ") + " · Title line: " + (s.title ? NAMES[s.title] : "skipped");
    return {{
      c, t, summary, status: s.status, statusColor: s.statusColor,
      buttonLabel: s.saved ? "Update picks" : "Submit picks",
      submit: () => {{
        if (s.ranks.length !== 3) {{ this.setState({{ status: "Pick three castaways.", statusColor: "#e25c5c" }}); return; }}
        this.setState({{ saved: true, status: "Saved. Good luck!", statusColor: "#4fd17a" }});
      }},
    }};
  }}
}}
</script>
</body>
</html>
'''
open("PostMerge.dc.html","w").write(post)
print("written")

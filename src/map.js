function text(value) { return String(value ?? '').replace(/[\r\n]+/g,' ').replace(/[\\|`*_[\]<>]/g,'\\$&'); }
function nodeLine(node) {
  return `[${node.id}] [${text(node.kind)}] ${text(node.label)} — ${text(node.status)}${node.verdict ? '/' + node.verdict : ''}${node.blockedReason ? ' ('+node.blockedReason+')' : ''}${node.summary ? ' · '+text(node.summary) : ''}`;
}
export function renderMap(trail, format = 'tree') {
  if (!['tree','table'].includes(format)) throw new Error('地图格式必须是 tree 或 table');
  const nodes = trail.nodes instanceof Map ? [...trail.nodes.values()] : trail.nodes ?? [];
  const edges = trail.edges ?? [];
  const meta = trail.meta ?? trail;
  const lines = [`# ${text(meta.goal)}`, '', `Trail: ${meta.id} · ${text(meta.status)} · ${nodes.length} nodes · ${edges.length} edges`, ''];
  if (format === 'table') {
    lines.push('| ID | 类型 | 线索 | 状态 | 优先级 | 摘要 |', '| --- | --- | --- | --- | --- | --- |');
    for (const n of nodes) lines.push(`| ${n.id} | ${text(n.kind)} | ${text(n.label)} | ${n.status}${n.verdict ? '/'+n.verdict : ''} | ${n.priority} | ${text(n.summary)} |`);
  } else {
    const known = new Set(nodes.map(n => n.id)), children = new Map(), visited = new Set();
    for (const n of nodes) {
      const parent = known.has(n.foundBy) && n.foundBy !== n.id ? n.foundBy : null;
      if (!children.has(parent)) children.set(parent,[]);
      children.get(parent).push(n);
    }
    function walk(node,depth) {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      lines.push(`${'  '.repeat(depth)}- ${nodeLine(node)}`);
      for (const child of children.get(node.id) ?? []) walk(child,depth+1);
    }
    for (const root of children.get(null) ?? []) walk(root,0);
    for (const node of nodes) if (!visited.has(node.id)) walk(node,0);
  }
  if (edges.length) {
    lines.push('', '## 发现关系', '');
    for (const edge of edges) lines.push(`- ${edge.from} → ${edge.to}: ${text(edge.reason)} · ${text(edge.url)}`);
  }
  const blocked = nodes.filter(n => n.status === 'blocked');
  if (blocked.length) {
    lines.push('', '## 被挡线索', '');
    for (const n of blocked) lines.push(`- ${n.id}: ${text(n.label)} · ${text(n.blockedReason)} · ${text(n.url)}`);
  }
  return lines.join('\n') + '\n';
}

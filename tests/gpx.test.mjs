import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = readFileSync(new URL("../index.html", import.meta.url), "utf8")
  .match(/<script>\n([\s\S]*)\n  <\/script>/)[1];

const node = (name, xml, attrs = "") => ({
  localName: name,
  getElementsByTagName(tag) {
    return [...xml.matchAll(new RegExp(`<${tag}([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tag}>)`, "g"))]
      .map((match) => node(tag, match[2] ?? "", match[1]));
  },
  getElementsByTagNameNS(_, tag) {
    return [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${tag}([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>)`, "g"))]
      .map((match) => node(tag, match[2] ?? "", match[1]));
  },
  getAttribute(key) { return attrs.match(new RegExp(`${key}="([^"]*)"`))?.[1] ?? null; },
});

class Parser {
  parseFromString(xml) {
    const valid = /^\s*(?:<\?xml[^>]*>\s*)?<(?:[\w-]+:)?gpx[\s>]/.test(xml) && /<\/(?:[\w-]+:)?gpx>/.test(xml);
    return {
      documentElement: node(valid ? "gpx" : "parsererror", xml),
      getElementsByTagName: (tag) => valid ? node("gpx", xml).getElementsByTagName(tag) : tag === "parsererror" ? [1] : [],
      getElementsByTagNameNS: (_, tag) => valid ? node("gpx", xml).getElementsByTagNameNS("*", tag) : [],
    };
  }
}

const element = () => ({
  hidden: true, value: "", files: [], children: [], listeners: {},
  addEventListener(name, fn) { this.listeners[name] = fn; },
  append(...children) { this.children.push(...children); },
  remove() { this.removed = true; },
});

const load = () => {
  const ids = ["gpx-file", "gpx-list", "gpx-clear", "gpx-error", "network-error", "api-error"];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  const map = {
    layers: [], fitBoundsCalls: [],
    setView() { return this; },
    removeLayer(layer) { this.layers = this.layers.filter((item) => item !== layer); },
    fitBounds(bounds) { this.fitBoundsCalls.push(bounds); },
  };
  const L = {
    map: () => map,
    tileLayer: () => ({ on() {}, addTo() {} }),
    layerGroup: () => ({ addTo() { return this; } }),
    polyline: (lines) => ({ lines, addTo() { map.layers.push(this); return this; }, getBounds() { return lines; } }),
  };
  new Function("document", "window", "L", "fetch", "DOMParser", script)(
    { getElementById: (id) => elements[id], createElement: () => element() },
    { L }, L, () => new Promise(() => {}), Parser,
  );
  const importFile = async (name, xml) => {
    elements["gpx-file"].files = [{ name, text: async () => xml }];
    await elements["gpx-file"].listeners.change();
  };
  return { elements, map, importFile };
};

const trace = `<gpx><wpt lat="9" lon="9"/><trk><trkseg><trkpt lat="42" lon="-1"/><trkpt lat="43" lon="-2"/></trkseg><trkseg><trkpt lat="44" lon="-3"/><trkpt lat="45" lon="-4"/></trkseg></trk></gpx>`;
const route = `<gpx><rte><rtept lat="46" lon="0"/><rtept lat="47" lon="1"/></rte></gpx>`;

test("importe des segments séparés sans relier les traces ni afficher les points de passage", async () => {
  const { map, elements, importFile } = load();
  await importFile("balade.gpx", trace);
  assert.deepEqual(map.layers[0].lines, [
    [[42, -1], [43, -2]], [[44, -3], [45, -4]],
  ]);
  assert.equal(map.fitBoundsCalls.length, 1);
  assert.equal(elements["gpx-list"].children[0].children[0].textContent, "balade.gpx ");
});

test("importe aussi un GPX avec préfixe d'espace de noms", async () => {
  const { map, importFile } = load();
  await importFile("prefixe.gpx", `<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:trk><g:trkseg><g:trkpt lat="42" lon="-1"/><g:trkpt lat="43" lon="-2"/></g:trkseg></g:trk></g:gpx>`);
  assert.deepEqual(map.layers[0].lines, [[[42, -1], [43, -2]]]);
});

test("ajoute une route et permet de retirer chaque fichier ou tous les fichiers", async () => {
  const { map, elements, importFile } = load();
  await importFile("trace.gpx", trace);
  await importFile("route.gpx", route);
  assert.equal(map.layers.length, 2);
  assert.deepEqual(map.layers[1].lines, [[[46, 0], [47, 1]]]);
  elements["gpx-list"].children[0].children[1].listeners.click();
  assert.deepEqual(map.layers.map((layer) => layer.lines), [[[[46, 0], [47, 1]]]]);
  elements["gpx-clear"].listeners.click();
  assert.equal(map.layers.length, 0);
  assert.equal(elements["gpx-clear"].hidden, true);
});

test("refuse les fichiers invalides et les GPX sans parcours sans effacer l'existant", async () => {
  const { map, elements, importFile } = load();
  await importFile("bon.gpx", route);
  for (const xml of ["pas du XML", "<gpx><wpt lat=\"42\" lon=\"1\"/></gpx>",
    '<gpx><rte><rtept lat="200" lon="0"/><rtept lat="42" lon="1"/></rte></gpx>']) {
    await importFile("mauvais.gpx", xml);
    assert.equal(elements["gpx-error"].hidden, false);
    assert.equal(map.layers.length, 1);
    assert.equal(map.fitBoundsCalls.length, 1);
  }
});

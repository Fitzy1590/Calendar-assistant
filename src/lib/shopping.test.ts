import { describe, expect, it } from "vitest";
import { extractPrice, kindsFor, parsePriceJson, trend, distanceKm } from "./shopping";

describe("extractPrice", () => {
  it("reads JSON-LD offers, including @graph", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Paint","offers":{"@type":"Offer","price":"64.90","priceCurrency":"AUD"}}]}</script>`;
    expect(extractPrice(html)).toEqual({ price: 64.9, currency: "AUD" });
  });
  it("reads product:price meta tags in either attribute order", () => {
    expect(extractPrice(`<meta property="product:price:amount" content="19.00"><meta property="product:price:currency" content="AUD">`)).toEqual({ price: 19, currency: "AUD" });
    expect(extractPrice(`<meta content="7.5" property="og:price:amount">`)?.price).toBe(7.5);
  });
  it("returns null when no price is published", () => {
    expect(extractPrice("<html><body>$12</body></html>")).toBeNull();
  });
});

describe("helpers", () => {
  it("maps products to shop kinds", () => {
    expect(kindsFor("white paint 4L")).toContain("doityourself");
    expect(kindsFor("milk")).toContain("supermarket");
  });
  it("parses Claude price JSON and drops unsourced rows", () => {
    const rows = parsePriceJson('Here: [{"retailer":"A","product":"x","price":20,"url":"https://a.com/x"},{"retailer":"B","price":10,"url":"https://b.com"},{"retailer":"C","price":5}]');
    expect(rows.map((r) => r.retailer)).toEqual(["B", "A"]);
  });
  it("computes trends", () => {
    const t = trend([{ at: 1, price: 50, currency: "AUD" }, { at: 2, price: 45, currency: "AUD" }, { at: 3, price: 45, currency: "AUD" }]);
    expect(t).toMatchObject({ current: 45, previous: 50, changeFromPrev: -5, lowest: 45, changeFromFirst: -5 });
  });
  it("measures distance", () => {
    expect(Math.round(distanceKm({ lat: -33.815, lon: 151.003 }, { lat: -33.868, lon: 151.209 }))).toBe(20);
  });
});

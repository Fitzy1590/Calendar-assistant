import { describe, expect, it } from "vitest";
import { cityGuesses, regionDefaults, senderIdeas } from "./suggest";

describe("suggestions", () => {
  it("suggests week start and clock from the region", () => {
    expect(regionDefaults("en-GB", false)).toEqual({ weekStartsOn: 1, clock24: true });
    expect(regionDefaults("en-AU", true).weekStartsOn).toBe(1);
    expect(regionDefaults("en-US", true)).toEqual({ weekStartsOn: 0, clock24: false });
    expect(regionDefaults("not a locale!!", false).weekStartsOn).toBe(1);
  });
  it("guesses a town from the time zone", () => {
    expect(cityGuesses("Australia/Sydney")).toEqual(["Sydney"]);
    expect(cityGuesses("America/New_York")).toEqual(["New York"]);
    expect(cityGuesses("UTC")).toEqual([]);
    expect(cityGuesses("Etc/GMT+10")).toEqual([]);
  });
  it("suggests sender domains from your mail, skipping personal mail hosts", () => {
    const a = ["bills@energyco.com", "x@energyco.com", "me@gmail.com", "a@bank.com.au", "b@bank.com.au", "c@bank.com.au", "d@shop.com"];
    expect(senderIdeas(a, 2)).toEqual(["@bank.com.au", "@energyco.com"]);
    expect(senderIdeas([])).toEqual([]);
  });
});

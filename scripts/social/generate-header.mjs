#!/usr/bin/env node
// Generate SBS social header/banner image (1500x500)

import satori from "satori";
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const WIDTH = 1500;
const HEIGHT = 500;

// Load font
let fontData;
const fontPaths = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"];
for (const p of fontPaths) {
  try { fontData = readFileSync(p); break; } catch {}
}
if (!fontData) {
  const res = await fetch("https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf");
  fontData = Buffer.from(await res.arrayBuffer());
}

const cities = ["San Jose", "Palo Alto", "Campbell", "Los Gatos", "Saratoga", "Cupertino", "Sunnyvale", "Mountain View", "Santa Clara", "Los Altos", "Milpitas"];

const card = {
  type: "div",
  props: {
    style: {
      width: WIDTH,
      height: HEIGHT,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#FAF9F6",
      fontFamily: "Inter",
      position: "relative",
    },
    children: [
      // Subtle city names scattered in background
      {
        type: "div",
        props: {
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "30px 60px",
            opacity: 0.04,
          },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", justifyContent: "space-between", width: "100%", fontSize: "18px", color: "#1A1A1A", letterSpacing: "4px", textTransform: "uppercase" },
                children: [
                  { type: "span", props: { children: "Events" } },
                  { type: "span", props: { children: "Government" } },
                  { type: "span", props: { children: "Transit" } },
                  { type: "span", props: { children: "Development" } },
                  { type: "span", props: { children: "Sports" } },
                ],
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", justifyContent: "space-between", width: "100%", fontSize: "16px", color: "#1A1A1A", letterSpacing: "3px" },
                children: cities.map(c => ({ type: "span", props: { children: c } })),
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", justifyContent: "space-between", width: "100%", fontSize: "18px", color: "#1A1A1A", letterSpacing: "4px", textTransform: "uppercase" },
                children: [
                  { type: "span", props: { children: "Tech" } },
                  { type: "span", props: { children: "Arts" } },
                  { type: "span", props: { children: "Community" } },
                  { type: "span", props: { children: "Food" } },
                  { type: "span", props: { children: "Outdoors" } },
                ],
              },
            },
          ],
        },
      },
      // Top rule
      {
        type: "div",
        props: {
          style: {
            position: "absolute",
            top: "80px",
            left: "120px",
            right: "120px",
            height: "1px",
            backgroundColor: "#C8C4BC",
          },
        },
      },
      // Bottom rule
      {
        type: "div",
        props: {
          style: {
            position: "absolute",
            bottom: "80px",
            left: "120px",
            right: "120px",
            height: "1px",
            backgroundColor: "#C8C4BC",
          },
        },
      },
      // Center content
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
          },
          children: [
            {
              type: "div",
              props: {
                style: { fontSize: "18px", color: "#888888", fontStyle: "italic" },
                children: "The",
              },
            },
            {
              type: "div",
              props: {
                style: { fontSize: "56px", fontWeight: 700, color: "#1A1A1A", letterSpacing: "-1px", lineHeight: "1" },
                children: "The South Bay Signal",
              },
            },
            {
              type: "div",
              props: {
                style: { fontSize: "13px", color: "#888888", letterSpacing: "8px", textTransform: "uppercase", marginTop: "8px" },
                children: "----------------------------------------------",
              },
            },
            {
              type: "div",
              props: {
                style: { fontSize: "15px", color: "#555555", letterSpacing: "1px", marginTop: "16px" },
                children: "Events · Civic updates · A few good reasons to leave the house",
              },
            },
          ],
        },
      },
    ],
  },
};

const svg = await satori(card, {
  width: WIDTH,
  height: HEIGHT,
  fonts: [{ name: "Inter", data: fontData, weight: 400, style: "normal" }],
});

const png = await sharp(Buffer.from(svg)).png({ quality: 95 }).toBuffer();
writeFileSync("/tmp/sbs-header.png", png);
console.log("✅ Header saved to /tmp/sbs-header.png");

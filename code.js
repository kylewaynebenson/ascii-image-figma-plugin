/// <reference types="@figma/plugin-typings" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Default settings
const defaultSettings = {
    columns: 32,
    chars: "@%#*+=-.  ",
    width: 400,
    textColor: "#ffffff" // Default black
};
// Store settings
let settings = Object.assign({}, defaultSettings);
// Load stored settings
// Update loadSettings
const loadSettings = () => __awaiter(this, void 0, void 0, function* () {
    try {
        const saved = yield figma.clientStorage.getAsync('asciiArtSettings');
        if (saved) {
            settings = Object.assign(Object.assign({}, settings), saved);
        }
        // Send settings to UI
        figma.ui.postMessage({
            type: 'init',
            columns: settings.columns,
            chars: settings.chars,
            width: settings.width,
            textColor: settings.textColor
        });
    }
    catch (error) {
        figma.notify('Error loading settings: ' + error.message);
    }
});
// Save settings
const saveSettings = () => __awaiter(this, void 0, void 0, function* () {
    yield figma.clientStorage.setAsync('asciiArtSettings', settings);
});
// Function to process any node and generate ASCII art
const processImage = (selection) => __awaiter(this, void 0, void 0, function* () {
    try {
        // Export selection to PNG bytes
        let bytes;
        // Check if the selection is directly an image
        if ('fills' in selection && selection.fills.some(fill => fill.type === 'IMAGE')) {
            // Original image handling
            const imageNode = selection;
            const fills = imageNode.fills;
            const imageFill = fills.find(fill => fill.type === 'IMAGE');
            if (!imageFill || !imageFill.imageHash) {
                figma.notify('Cannot extract image data');
                return;
            }
            // Get image from hash
            const image = figma.getImageByHash(imageFill.imageHash);
            if (!image) {
                figma.notify('Cannot retrieve image data');
                return;
            }
            bytes = yield image.getBytesAsync();
        }
        else {
            // For any other node type, export as PNG
            bytes = yield selection.exportAsync({
                format: 'PNG',
                constraint: { type: 'SCALE', value: 1 }
            });
        }
        // Process image in UI context (where we have Canvas API)
        figma.ui.postMessage({
            type: 'processImage',
            bytes,
            columns: settings.columns,
            chars: settings.chars,
            width: selection.width,
            height: selection.height,
            outputWidth: settings.width // Add the output width parameter
        });
    }
    catch (error) {
        figma.notify('Error processing selection: ' + error.message);
    }
});
// Show the UI
figma.showUI(__html__, { width: 300, height: 400 });
// Load settings immediately
loadSettings();
// Update the onmessage handler
figma.ui.onmessage = (msg) => __awaiter(this, void 0, void 0, function* () {
    if (msg.type === 'generate') {
        // Update settings
        settings.columns = msg.columns;
        settings.chars = msg.chars;
        settings.width = msg.width; // Add width
        settings.textColor = msg.textColor;
        yield saveSettings();
        // Check if there's a selection
        if (figma.currentPage.selection.length === 0) {
            figma.notify('Please select an image to convert');
            return;
        }
        const selection = figma.currentPage.selection[0];
        yield processImage(selection);
    }
    else if (msg.type === 'asciiResult') {
        try {
            // Get the current selection (should be the same as before)
            if (figma.currentPage.selection.length === 0) {
                figma.notify('Selection lost during processing');
                return;
            }
            const imageNode = figma.currentPage.selection[0];
            // Send preview to UI
            figma.ui.postMessage({
                type: 'preview',
                asciiArt: msg.asciiArt
            });
            // Create text node with ASCII art
            const textNode = figma.createText();
            // Load a monospace font
            yield figma.loadFontAsync({ family: "Roboto Mono", style: "Regular" });
            // Set text properties
            textNode.fontName = { family: "Roboto Mono", style: "Regular" };
            textNode.textAlignHorizontal = "LEFT";
            textNode.textAlignVertical = "TOP";
            // Apply the calculated font size to maintain proportions
            textNode.fontSize = Math.max(4, Math.min(40, msg.fontSize)); // Keep font size in reasonable range
            textNode.characters = msg.asciiArt;
            // Instead of resizing to fixed dimensions, let's just set the constraints
            // This will make the text auto-width while maintaining the set font size
            textNode.textAutoResize = "HEIGHT"; // This makes it auto height but fixed width
            // Set a reasonable width constraint to prevent overflow
            textNode.resize(settings.width, textNode.height);
            // After setting the initial width, switch to auto width
            textNode.textAutoResize = "WIDTH_AND_HEIGHT";
            // Apply color from hex
            const rgbColor = hexToRgb(settings.textColor);
            textNode.fills = [{ type: 'SOLID', color: rgbColor }];
            // Position text node near original image
            textNode.x = imageNode.x + imageNode.width + 20;
            textNode.y = imageNode.y;
            // Add to current page
            figma.currentPage.appendChild(textNode);
            // Select the new text node
            figma.currentPage.selection = [textNode];
            // Send reset message to UI
            figma.ui.postMessage({
                type: 'reset'
            });
            figma.notify('ASCII art generated!');
        }
        catch (error) {
            figma.notify('Error creating ASCII text: ' + error.message);
        }
    }
    else if (msg.type === 'cancel') {
        figma.closePlugin();
    }
});
// Helper function to convert hex to RGB
function hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace(/^#/, '');
    // Parse hex values
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return { r, g, b };
}

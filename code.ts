/// <reference types="@figma/plugin-typings" />

// Update settings interface
interface PluginSettings {
  columns: number;
  chars: string;
  width: number;
  textColor: string; // Simplified to hex color string
}

// Default settings
const defaultSettings: PluginSettings = {
  columns: 32,
  chars: "@%#*+=-.  ",
  width: 400,
  textColor: "#ffffff" // Default black
};

// Store settings
let settings: PluginSettings = { ...defaultSettings };

// Load stored settings
// Update loadSettings
const loadSettings = async (): Promise<void> => {
  try {
    const saved = await figma.clientStorage.getAsync('asciiArtSettings');
    if (saved) {
      settings = { ...settings, ...saved as PluginSettings };
    }
    
    // Send settings to UI
    figma.ui.postMessage({
      type: 'init',
      columns: settings.columns,
      chars: settings.chars,
      width: settings.width,
      textColor: settings.textColor
    });
  } catch (error) {
    figma.notify('Error loading settings: ' + error.message);
  }
};

// Save settings
const saveSettings = async (): Promise<void> => {
  await figma.clientStorage.setAsync('asciiArtSettings', settings);
};

// Function to process any node and generate ASCII art
const processImage = async (selection: SceneNode): Promise<void> => {
  try {
    // Export selection to PNG bytes
    let bytes: Uint8Array;
    
    // Check if the selection is directly an image
    if ('fills' in selection && (selection.fills as ReadonlyArray<Paint>).some(fill => fill.type === 'IMAGE')) {
      // Original image handling
      const imageNode = selection as SceneNode & { fills: ReadonlyArray<Paint> };
      const fills = imageNode.fills as ReadonlyArray<Paint>;
      const imageFill = fills.find(fill => fill.type === 'IMAGE') as ImagePaint;
      
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
      
      bytes = await image.getBytesAsync();
    } else {
      // For any other node type, export as PNG
      bytes = await selection.exportAsync({
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
      outputWidth: settings.width  // Add the output width parameter
    });
    
  } catch (error) {
    figma.notify('Error processing selection: ' + error.message);
  }
};

// Show the UI
figma.showUI(__html__, { width: 300, height: 400 });

// Load settings immediately
loadSettings();

// Update the onmessage handler
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'generate') {
    // Update settings
    settings.columns = msg.columns;
    settings.chars = msg.chars;
    settings.width = msg.width;  // Add width
    settings.textColor = msg.textColor;
    await saveSettings();
    
    // Check if there's a selection
    if (figma.currentPage.selection.length === 0) {
      figma.notify('Please select an image to convert');
      return;
    }
    
    const selection = figma.currentPage.selection[0];
    await processImage(selection);
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
      await figma.loadFontAsync({ family: "IBM Plex Mono", style: "Regular" });
      
      // Set text properties
      textNode.fontName = { family: "IBM Plex Mono", style: "Regular" };
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

      // Position text node 100px to the right of the original image (changed from 20px)
      textNode.x = imageNode.x + imageNode.width + 100;
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
    } catch (error) {
      figma.notify('Error creating ASCII text: ' + error.message);
    }
  } 
  else if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

// Helper function to convert hex to RGB
function hexToRgb(hex: string): {r: number, g: number, b: number} {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  return {r, g, b};
}
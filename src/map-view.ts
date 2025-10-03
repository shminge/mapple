import { BasesEntry, BasesPropertyId, BasesView, MarkdownRenderer, QueryController, StringValue, ViewOption } from "obsidian";
import * as L from "leaflet";

import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Create a Leaflet icon with explicit URLs
const DefaultIcon = L.icon({
    iconUrl: `data:image/png;base64,${markerIcon}`,
    iconRetinaUrl: `data:image/png;base64,${markerIcon2x}`,
    shadowUrl: `data:image/png;base64,${markerShadow}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

// Override Leaflet default marker
L.Marker.prototype.options.icon = DefaultIcon;

interface ImageDimensions {
	width: number;
	height: number;
	aspectRatio: number;
}

export class MapView extends BasesView {
    type = "mapple-map";
    map: L.Map;
    localImageData: string | null = null;
    imageDimensions: ImageDimensions | null = null;
    localImagePath: string = '';
    imageOverlay: L.ImageOverlay | null = null;
    markers: L.Marker[] = [];
    coordinatesProp: BasesPropertyId | null;

    onDataUpdated(): void {
        // TODO markers and stuff
        this.loadConfig();
        this.updateMarkers();
    }

    constructor(controller: QueryController, containerEl: HTMLElement) {
        super(controller);

        // Ensure the container itself is positioned and has full height
        containerEl.style.position = "relative";
        containerEl.style.width = "100%";
        containerEl.style.height = "100%";
        containerEl.style.overflow = "hidden";
        
        // Create map container div
        const mapEl = containerEl.createDiv({
            cls: "map-container",
            attr: { id: "map" }
        });
        
        // Give it full dimensions with absolute positioning
        mapEl.style.width = "100%";
        mapEl.style.height = "100%";
        mapEl.style.position = "absolute";
        mapEl.style.top = "0";
        mapEl.style.left = "0";

        // Initialize Leaflet map with CRS.Simple for image coordinates
        this.map = L.map(mapEl, {
            crs: L.CRS.Simple, // Use simple coordinate system for images
            center: [0, 0],
            zoom: 1,
            zoomControl: true,
            minZoom: -5,
            maxZoom: 5
        });


        
        setTimeout(() => {
            this.map.invalidateSize();
        }, 100);
    }

    updateMarkers() {
    for (let marker of this.markers) marker.remove();
    if (!this.map || !this.data || !this.coordinatesProp) return;

    for (const entry of this.data.data) {
        const c = this.extractCoordinates(entry);
        const m = L.marker(c as L.LatLngExpression);

        const popupDiv = document.createElement("div");
        MarkdownRenderer.render(this.app, `![[${entry.file.path}]]`, popupDiv, entry.file.path, this);

        m.bindPopup(popupDiv);

        // open on hover
        m.on("mouseover", () => m.openPopup());
        m.on("mouseout", () => m.closePopup());

        this.markers.push(m);
        m.addTo(this.map);
    }
}

    async loadConfig() {

        this.coordinatesProp = this.config.getAsPropertyId('coordinates');

        // Load local image path

        const localImageConfig = this.config.get('mapImage');
        const newLocalImagePath = (localImageConfig && typeof localImageConfig === 'string') 
            ? localImageConfig.trim() 
            : '';


        // Reload image if path changed
        if (newLocalImagePath !== this.localImagePath) {
            if (newLocalImagePath) {
                await this.loadImage(newLocalImagePath);
            } else {
                this.localImagePath = '';
                this.localImageData = null;
                this.imageDimensions = null;
                this.clearImageOverlay(); // Clear the overlay
            }
        }
    }

    private clearImageOverlay() {
        if (this.imageOverlay) {
            this.imageOverlay.remove();
            this.imageOverlay = null;
        }
    }

    private updateImageOverlay() {
        // Remove existing overlay
        this.clearImageOverlay();

        if (!this.localImageData || !this.imageDimensions) return;

        // Calculate bounds based on image dimensions
        const bounds: L.LatLngBoundsExpression = [
            [0, 0],
            [this.imageDimensions.height, this.imageDimensions.width]
        ];

        // Add the image overlay
        this.imageOverlay = L.imageOverlay(this.localImageData, bounds).addTo(this.map);

        // Fit the map to the image bounds
        this.map.fitBounds(bounds);
    }

    private async loadImage(imagePath: string): Promise<void> {
        if (!imagePath || imagePath == this.localImagePath) return;

        try {
            const file = this.app.vault.getFileByPath(imagePath);
            if (!file) {
                console.error('Image file not found:', imagePath);
                this.localImageData = null;
                this.imageDimensions = null;
                return;
            }

            // Read the file as binary
            const arrayBuffer = await this.app.vault.readBinary(file);

            // Convert to base64
            const base64 = arrayBufferToBase64(arrayBuffer);

            // Determine MIME type from file extension
            const extension = imagePath.split('.').pop()?.toLowerCase();
            const mimeType = getMimeType(extension || '');

            this.localImageData = `data:${mimeType};base64,${base64}`;

            // Load image to get dimensions
            await this.loadImageDimensions(this.localImageData);

            this.localImagePath = imagePath;

            // Update the map with the new image
            this.updateImageOverlay();
        } catch (error) {
            console.error('Error loading local image:', error);
            this.localImageData = null;
            this.imageDimensions = null;
        }
    }


	private async loadImageDimensions(dataUrl: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				this.imageDimensions = {
					width: img.width,
					height: img.height,
					aspectRatio: img.width / img.height
				};
				resolve();
			};
			img.onerror = () => {
				reject(new Error('Failed to load image'));
			};
			img.src = dataUrl;
		});
	}

    	private extractCoordinates(entry: BasesEntry): Coordinates | null {
		if (!this.coordinatesProp) return null;

		try {
			const value = entry.getValue(this.coordinatesProp) as StringValue;

            return readCoords(value.toString().trim());
		}
		catch (error) {
			console.error(`Error extracting coordinates for ${entry.file.name}:`, error);
		}

		return null;
	}
    


    static getViewOptions(): ViewOption[] {
		return [
			{
				displayName: 'Map',
				type: 'group',
				items: [

					{
						displayName: 'Map Image',
						type: 'text',
						key: 'mapImage',
						placeholder: 'none',
					},
					{
						displayName: 'Default zoom',
						type: 'slider',
						key: 'defaultZoom',
						min: 1,
						max: 18,
						step: 1,
						default: 5,
					},
					{
						displayName: 'Minimum zoom',
						type: 'slider',
						key: 'minZoom',
						min: 0,
						max: 24,
						step: 1,
						default: 0,
					},
					{
						displayName: 'Maximum zoom',
						type: 'slider',
						key: 'maxZoom',
						min: 0,
						max: 24,
						step: 1,
						default: 18,
					},
				]
			},
			{
				displayName: 'Markers',
				type: 'group',
				items: [
					{
						displayName: 'Marker coordinates',
						type: 'property',
						key: 'coordinates',
						filter: prop => !prop.startsWith('file.'),
						placeholder: 'Property',
					},
					{
						displayName: 'Marker icon',
						type: 'property',
						key: 'markerIcon',
						filter: prop => !prop.startsWith('file.'),
						placeholder: 'Property',
					},
					{
						displayName: 'Marker color',
						type: 'property',
						key: 'markerColor',
						filter: prop => !prop.startsWith('file.'),
						placeholder: 'Property',
					},
				]
			},
		];
	}
}



/** Convert ArrayBuffer to base64 string */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = '';
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return window.btoa(binary);
}

/** Get MIME type from file extension */
function getMimeType(extension: string): string {
	const mimeTypes: Record<string, string> = {
		'png': 'image/png',
		'jpg': 'image/jpeg',
		'jpeg': 'image/jpeg',
		'gif': 'image/gif',
		'bmp': 'image/bmp',
		'webp': 'image/webp',
		'svg': 'image/svg+xml',
		'tiff': 'image/tiff',
		'tif': 'image/tiff'
	};
	return mimeTypes[extension] || 'image/png';
}

type Coordinates = [number, number];
function readCoords(c: string): Coordinates {
    return c.split(',').map((n)=>(Number(n))) as Coordinates
}
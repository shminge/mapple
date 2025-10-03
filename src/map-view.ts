import { BasesView, QueryController } from "obsidian";


export class MapView extends BasesView {
    type = "mapple-map";

    containerEl: HTMLElement;

    constructor(controller: QueryController, containerEl: HTMLElement) {
        super(controller);
        this.containerEl = containerEl;
        containerEl.innerHTML = "<p>hello world<p>"
    }

    onDataUpdated(): void {
        
    }

}
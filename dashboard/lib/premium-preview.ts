/** A review is valid only until the next edit, cancel, or review request. */
export class PreviewReview<T> {
  private revision = 0;
  invalidate() { this.revision++; }
  begin(operation:T) { return {revision:++this.revision,snapshot:structuredClone(operation)}; }
  accept(ticket:{revision:number;snapshot:T}):T|null { return ticket.revision===this.revision?ticket.snapshot:null; }
}

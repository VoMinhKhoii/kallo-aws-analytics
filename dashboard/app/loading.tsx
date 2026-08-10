const skeletonPanels = ["wide", "half", "half", "half", "half", "wide", "half", "half", "wide"];

export default function Loading() {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
      <div className="mb-10 flex items-start justify-between gap-6">
        <div className="space-y-3">
          <div className="skeleton h-4 w-28" />
          <div className="skeleton h-10 w-64" />
          <div className="skeleton h-4 w-80 max-w-full" />
        </div>
        <div className="skeleton h-11 w-40" />
      </div>
      <div className="panel mb-5 p-5 sm:p-6">
        <div className="skeleton mb-3 h-5 w-36" />
        <div className="skeleton mb-7 h-3 w-96 max-w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {skeletonPanels.map((size, index) => (
          <div key={index} className={`panel p-5 ${size === "wide" ? "lg:col-span-2" : ""}`}>
            <div className="skeleton mb-3 h-5 w-40" />
            <div className="skeleton mb-8 h-3 w-72 max-w-full" />
            <div className="skeleton h-64 w-full" />
          </div>
        ))}
      </div>
    </main>
  );
}

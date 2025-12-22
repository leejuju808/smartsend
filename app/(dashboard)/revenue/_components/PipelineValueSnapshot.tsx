"use client";

type PipelineValue = {
  estimateTotal: number;
  jobsWonFuture: number;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function PipelineValueSnapshot({
  pipelineValue,
}: {
  pipelineValue: PipelineValue;
}) {
  const totalPipelineValue = pipelineValue.estimateTotal + pipelineValue.jobsWonFuture;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-muted-foreground mb-1">Estimate Total</div>
          <div className="text-2xl font-bold">
            {formatCurrency(pipelineValue.estimateTotal)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Active estimates in pipeline
          </div>
        </div>
        
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-muted-foreground mb-1">Jobs Won (Future)</div>
          <div className="text-2xl font-bold">
            {formatCurrency(pipelineValue.jobsWonFuture)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Awaiting completion
          </div>
        </div>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <div className="text-sm text-muted-foreground mb-1">Total Pipeline Value</div>
        <div className="text-3xl font-bold">
          {formatCurrency(totalPipelineValue)}
        </div>
      </div>
    </div>
  );
}





























































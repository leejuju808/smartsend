"use client";
import { useEffect, useRef } from "react";

interface ChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  title?: string;
  type?: "bar" | "pie";
}

export default function SimpleChart({ data, title, type = "bar" }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = 400;
    canvas.height = 200;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (type === "bar") {
      drawBarChart(ctx, data, canvas.width, canvas.height);
    } else {
      drawPieChart(ctx, data, canvas.width, canvas.height);
    }
  }, [data, type]);

  const drawBarChart = (ctx: CanvasRenderingContext2D, data: any[], width: number, height: number) => {
    const maxValue = Math.max(...data.map(d => d.value));
    const barWidth = width / data.length - 10;
    const barSpacing = 10;

    data.forEach((item, index) => {
      const barHeight = (item.value / maxValue) * (height - 40);
      const x = index * (barWidth + barSpacing) + barSpacing;
      const y = height - barHeight - 20;

      // Draw bar
      ctx.fillStyle = item.color || "#3B82F6";
      ctx.fillRect(x, y, barWidth, barHeight);

      // Draw label
      ctx.fillStyle = "#374151";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(item.label, x + barWidth / 2, height - 5);

      // Draw value
      ctx.fillText(item.value.toString(), x + barWidth / 2, y - 5);
    });
  };

  const drawPieChart = (ctx: CanvasRenderingContext2D, data: any[], width: number, height: number) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 20;

    const total = data.reduce((sum, item) => sum + item.value, 0);
    let currentAngle = 0;

    data.forEach((item, index) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;

      // Draw slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = item.color || `hsl(${(index * 137.5) % 360}, 70%, 50%)`;
      ctx.fill();

      // Draw label
      const labelAngle = currentAngle + sliceAngle / 2;
      const labelX = centerX + Math.cos(labelAngle) * (radius + 20);
      const labelY = centerY + Math.sin(labelAngle) * (radius + 20);

      ctx.fillStyle = "#374151";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${item.label}: ${item.value}`, labelX, labelY);

      currentAngle += sliceAngle;
    });
  };

  return (
    <div className="bg-white border rounded-lg p-4">
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      <canvas ref={canvasRef} className="w-full h-48" />
    </div>
  );
}
// Block 242000 — Scheduling Engine v2
// AI Models for Scheduling: ScheduleAI, CapacityAI, RoutingAI

import { createClient } from "@/lib/supabase/server";

export interface JobDurationPrediction {
  estimated_hours: number;
  confidence: number;
  factors: {
    roof_squares: number;
    complexity_factor: number;
    job_type: string;
    weather_impact: number;
  };
}

export interface BestCrewRecommendation {
  crew_id: string;
  crew_name: string;
  score: number;
  reasoning: string;
  availability: {
    date: string;
    available_hours: number;
  };
}

export interface TravelEfficiency {
  route_optimization: {
    job_order: string[];
    total_travel_time: number;
    travel_time_saved: number;
  };
  clustering_score: number;
}

export interface JobComplexity {
  complexity_score: number; // 1-10
  factors: {
    roof_squares: number;
    pitch: number;
    cut_up_factor: number;
    skylights: number;
    chimneys: number;
    valleys: number;
    decking_replacement: number;
  };
}

/**
 * ScheduleAI — Predicts job duration, best crew, travel efficiency, job complexity
 */
export class ScheduleAI {
  /**
   * Predict job duration based on job characteristics
   */
  static async predictJobDuration(job: any): Promise<JobDurationPrediction> {
    const baseHoursPerSquare = 0.5;
    const squares = job.roof_squares || 30;
    const complexity = job.complexity_factor || 1.0;
    const jobType = job.job_type || "roof_replacement";

    // Adjust base hours by job type
    let typeMultiplier = 1.0;
    switch (jobType) {
      case "repair":
        typeMultiplier = 0.3;
        break;
      case "inspection":
        typeMultiplier = 0.1;
        break;
      case "gutter":
        typeMultiplier = 0.2;
        break;
      case "roof_replacement":
      default:
        typeMultiplier = 1.0;
    }

    const baseHours = squares * baseHoursPerSquare * typeMultiplier;
    const estimatedHours = Math.ceil(baseHours * complexity);

    // Confidence based on data completeness
    let confidence = 0.7;
    if (job.roof_squares && job.complexity_factor) confidence = 0.9;
    if (job.actual_hours) confidence = 0.95; // Historical data available

    return {
      estimated_hours: estimatedHours,
      confidence,
      factors: {
        roof_squares: squares,
        complexity_factor: complexity,
        job_type: jobType,
        weather_impact: 0, // Would factor in weather
      },
    };
  }

  /**
   * Recommend best crew for a job
   */
  static async recommendBestCrew(
    job: any,
    crews: any[],
    existingSchedules: any[],
    targetDate: string
  ): Promise<BestCrewRecommendation | null> {
    if (crews.length === 0) return null;

    const recommendations: BestCrewRecommendation[] = [];

    for (const crew of crews) {
      // Calculate availability
      const availability = await this.calculateCrewAvailability(
        crew.id,
        existingSchedules,
        targetDate
      );

      // Score crew based on:
      // 1. Availability (40%)
      // 2. Capacity (30%)
      // 3. Specialization (20%)
      // 4. Historical performance (10%)

      const availabilityScore = availability.available_hours > 0 ? 1.0 : 0.0;
      const capacityScore = Math.min(1.0, availability.available_hours / 8); // Normalize to 8 hours
      const specializationScore = 0.8; // Would check crew specialization
      const performanceScore = 0.9; // Would check historical performance

      const totalScore =
        availabilityScore * 0.4 +
        capacityScore * 0.3 +
        specializationScore * 0.2 +
        performanceScore * 0.1;

      recommendations.push({
        crew_id: crew.id,
        crew_name: crew.name,
        score: totalScore,
        reasoning: `Available ${availability.available_hours} hours on ${targetDate}`,
        availability,
      });
    }

    // Sort by score and return best
    recommendations.sort((a, b) => b.score - a.score);
    return recommendations[0] || null;
  }

  /**
   * Calculate travel efficiency and route optimization
   */
  static async calculateTravelEfficiency(
    jobs: any[]
  ): Promise<TravelEfficiency> {
    if (jobs.length < 2) {
      return {
        route_optimization: {
          job_order: jobs.map((j) => j.id),
          total_travel_time: 0,
          travel_time_saved: 0,
        },
        clustering_score: 1.0,
      };
    }

    // Simple clustering: group by address proximity
    const clusters = this.clusterJobsByLocation(jobs);
    const bestCluster = clusters[0] || { jobs: [], travel_time: 0 };

    // Calculate travel time for optimized route
    const optimizedRoute = this.optimizeRoute(bestCluster.jobs);
    const totalTravelTime = optimizedRoute.total_time;
    const travelTimeSaved = (jobs.length - 1) * 30 - totalTravelTime; // Assume 30 min between jobs without optimization

    return {
      route_optimization: {
        job_order: optimizedRoute.job_order,
        total_travel_time: totalTravelTime,
        travel_time_saved: Math.max(0, travelTimeSaved),
      },
      clustering_score: bestCluster.jobs.length / jobs.length, // Ratio of jobs in cluster
    };
  }

  /**
   * Analyze job complexity
   */
  static async analyzeJobComplexity(job: any): Promise<JobComplexity> {
    const squares = job.roof_squares || 30;
    const pitch = job.roof_pitch || 4; // Default 4/12
    const cutUp = job.cut_up_factor || 1.0;
    const skylights = job.skylights_count || 0;
    const chimneys = job.chimneys_count || 0;
    const valleys = job.valleys_count || 0;
    const decking = job.decking_replacement_squares || 0;

    // Calculate complexity score (1-10)
    let complexityScore = 1.0;

    // Base complexity from size
    if (squares > 50) complexityScore += 2;
    else if (squares > 30) complexityScore += 1;

    // Pitch complexity
    if (pitch > 8) complexityScore += 1.5;
    else if (pitch > 6) complexityScore += 0.5;

    // Cut-up complexity
    if (cutUp > 1.2) complexityScore += 1;

    // Feature complexity
    complexityScore += skylights * 0.3;
    complexityScore += chimneys * 0.4;
    complexityScore += valleys * 0.2;
    complexityScore += (decking / 10) * 0.5; // Decking replacement adds complexity

    complexityScore = Math.min(10, Math.max(1, complexityScore));

    return {
      complexity_score: complexityScore,
      factors: {
        roof_squares: squares,
        pitch,
        cut_up_factor: cutUp,
        skylights,
        chimneys,
        valleys,
        decking_replacement: decking,
      },
    };
  }

  // Helper methods
  private static async calculateCrewAvailability(
    crewId: string,
    existingSchedules: any[],
    targetDate: string
  ): Promise<{ date: string; available_hours: number }> {
    const crewSchedules = existingSchedules.filter(
      (s) => s.crew_id === crewId && s.scheduled_start?.startsWith(targetDate)
    );

    const scheduledHours = crewSchedules.reduce((sum, s) => {
      const start = new Date(s.scheduled_start);
      const end = new Date(s.scheduled_end);
      return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }, 0);

    return {
      date: targetDate,
      available_hours: Math.max(0, 8 - scheduledHours), // Assume 8 hour day
    };
  }

  private static clusterJobsByLocation(jobs: any[]): any[] {
    const clusters: Record<string, any[]> = {};

    for (const job of jobs) {
      const key = job.address
        ? job.address.split(",")[0].trim()
        : "unknown";

      if (!clusters[key]) {
        clusters[key] = [];
      }
      clusters[key].push(job);
    }

    return Object.entries(clusters)
      .map(([location, jobs]) => ({
        location,
        jobs,
        travel_time: (jobs.length - 1) * 15, // 15 min between jobs in same area
      }))
      .sort((a, b) => b.jobs.length - a.jobs.length);
  }

  private static optimizeRoute(jobs: any[]): {
    job_order: string[];
    total_time: number;
  } {
    // Simple optimization: return jobs in order
    // In production, would use TSP (Traveling Salesman Problem) algorithm
    return {
      job_order: jobs.map((j) => j.id),
      total_time: (jobs.length - 1) * 15, // 15 min between jobs
    };
  }
}

/**
 * CapacityAI — Predicts crew workload and capacity
 */
export class CapacityAI {
  /**
   * Predict crew workload for date range
   */
  static async predictCrewWorkload(
    crewId: string,
    startDate: string,
    endDate: string,
    existingSchedules: any[]
  ): Promise<{
    date: string;
    scheduled_hours: number;
    available_hours: number;
    utilization_percent: number;
    overloaded: boolean;
  }[]> {
    const result: any[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const daySchedules = existingSchedules.filter(
        (s) =>
          s.crew_id === crewId &&
          s.scheduled_start?.startsWith(dateStr) &&
          s.status !== "cancelled"
      );

      const scheduledHours = daySchedules.reduce((sum, s) => {
        const start = new Date(s.scheduled_start);
        const end = new Date(s.scheduled_end);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }, 0);

      const availableHours = Math.max(0, 8 - scheduledHours);
      const utilization = (scheduledHours / 8) * 100;

      result.push({
        date: dateStr,
        scheduled_hours: scheduledHours,
        available_hours: availableHours,
        utilization_percent: utilization,
        overloaded: scheduledHours > 8,
      });
    }

    return result;
  }

  /**
   * Predict ideal assignment based on capacity
   */
  static async predictIdealAssignment(
    job: any,
    crews: any[],
    existingSchedules: any[],
    targetDate: string
  ): Promise<{
    recommended_crew_id: string;
    recommended_date: string;
    reasoning: string;
  } | null> {
    const jobDuration = await ScheduleAI.predictJobDuration(job);
    const hoursNeeded = jobDuration.estimated_hours;

    let bestCrew = null;
    let bestDate = targetDate;
    let bestScore = -1;

    for (const crew of crews) {
      const workload = await this.predictCrewWorkload(
        crew.id,
        targetDate,
        targetDate,
        existingSchedules
      );

      const dayCapacity = workload[0];
      if (dayCapacity.available_hours >= hoursNeeded) {
        const score = dayCapacity.available_hours - hoursNeeded; // Prefer crews with more buffer
        if (score > bestScore) {
          bestScore = score;
          bestCrew = crew;
        }
      }
    }

    if (!bestCrew) {
      // Look ahead for available date
      for (let i = 1; i <= 14; i++) {
        const checkDate = new Date(targetDate);
        checkDate.setDate(checkDate.getDate() + i);
        const checkDateStr = checkDate.toISOString().split("T")[0];

        for (const crew of crews) {
          const workload = await this.predictCrewWorkload(
            crew.id,
            checkDateStr,
            checkDateStr,
            existingSchedules
          );

          const dayCapacity = workload[0];
          if (dayCapacity.available_hours >= hoursNeeded) {
            return {
              recommended_crew_id: crew.id,
              recommended_date: checkDateStr,
              reasoning: `Crew ${crew.name} has ${dayCapacity.available_hours.toFixed(1)} hours available on ${checkDateStr}`,
            };
          }
        }
      }

      return null; // No available slot found
    }

    return {
      recommended_crew_id: bestCrew.id,
      recommended_date: bestDate,
      reasoning: `Crew ${bestCrew.name} has capacity on ${bestDate}`,
    };
  }
}

/**
 * RoutingAI — Optimizes geographic clustering and travel time
 */
export class RoutingAI {
  /**
   * Optimize geographic clustering
   */
  static async optimizeGeographicClustering(
    jobs: any[],
    maxClusterSize: number = 5
  ): Promise<{
    clusters: {
      id: string;
      location: string;
      job_ids: string[];
      center_lat?: number;
      center_lng?: number;
      travel_time_saved: number;
    }[];
    total_travel_time_saved: number;
  }> {
    // Group jobs by location (city/neighborhood)
    const locationGroups: Record<string, any[]> = {};

    for (const job of jobs) {
      const key = job.address
        ? job.address.split(",")[0].trim()
        : "unknown";

      if (!locationGroups[key]) {
        locationGroups[key] = [];
      }
      locationGroups[key].push(job);
    }

    const clusters = Object.entries(locationGroups).map(
      ([location, jobs], index) => {
        // Calculate travel time saved by clustering
        // Without clustering: each job = 30 min travel
        // With clustering: 15 min between jobs in same area
        const travelTimeSaved =
          (jobs.length - 1) * (30 - 15); // Saved by clustering

        return {
          id: `cluster_${index}`,
          location,
          job_ids: jobs.map((j) => j.id),
          travel_time_saved: travelTimeSaved,
        };
      }
    );

    const totalTravelTimeSaved = clusters.reduce(
      (sum, c) => sum + c.travel_time_saved,
      0
    );

    return {
      clusters,
      total_travel_time_saved: totalTravelTimeSaved,
    };
  }

  /**
   * Calculate travel time reduction
   */
  static async calculateTravelTimeReduction(
    jobs: any[]
  ): Promise<{
    optimized_route: string[];
    total_travel_time: number;
    travel_time_saved: number;
    efficiency_gain_percent: number;
  }> {
    if (jobs.length < 2) {
      return {
        optimized_route: jobs.map((j) => j.id),
        total_travel_time: 0,
        travel_time_saved: 0,
        efficiency_gain_percent: 0,
      };
    }

    // Simple optimization: cluster by location
    const clusters = await this.optimizeGeographicClustering(jobs);
    const optimizedRoute = clusters[0]?.job_ids || jobs.map((j) => j.id);

    // Calculate times
    const unoptimizedTime = (jobs.length - 1) * 30; // 30 min between each job
    const optimizedTime = (optimizedRoute.length - 1) * 15; // 15 min within cluster
    const travelTimeSaved = unoptimizedTime - optimizedTime;
    const efficiencyGain = (travelTimeSaved / unoptimizedTime) * 100;

    return {
      optimized_route: optimizedRoute,
      total_travel_time: optimizedTime,
      travel_time_saved: travelTimeSaved,
      efficiency_gain_percent: efficiencyGain,
    };
  }

  /**
   * Suggest multi-crew coordination
   */
  static async suggestMultiCrewCoordination(
    jobs: any[],
    crews: any[]
  ): Promise<{
    recommendations: {
      job_id: string;
      primary_crew_id: string;
      secondary_crew_id?: string;
      reasoning: string;
    }[];
  }> {
    const recommendations = [];

    for (const job of jobs) {
      const complexity = await ScheduleAI.analyzeJobComplexity(job);
      const duration = await ScheduleAI.predictJobDuration(job);

      // Suggest multi-crew for large/complex jobs
      if (complexity.complexity_score > 7 || duration.estimated_hours > 16) {
        const primaryCrew = crews[0]; // Would use best crew logic
        const secondaryCrew = crews[1] || null;

        recommendations.push({
          job_id: job.id,
          primary_crew_id: primaryCrew?.id || "",
          secondary_crew_id: secondaryCrew?.id,
          reasoning: `Large/complex job (${duration.estimated_hours} hours, complexity ${complexity.complexity_score.toFixed(1)}) - consider multi-crew assignment`,
        });
      }
    }

    return { recommendations };
  }
}


























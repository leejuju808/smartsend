"use client";

import { Button } from "@/components/ui/button";
import { Rocket, Target, Zap, Mail } from "lucide-react";

interface Step1WelcomeProps {
  onNext: () => void;
}

export function Step1Welcome({ onNext }: Step1WelcomeProps) {
  return (
    <div className="text-center space-y-6 py-8">
      <div className="mx-auto w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
        <Rocket className="w-10 h-10 text-white" />
      </div>
      
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Let's launch your first roofing campaign
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          We'll guide you through connecting your email, adding contacts, choosing a template, and launching your first campaign. This takes about 15 minutes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mt-8">
        <div className="text-center p-4">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Connect Email</h3>
          <p className="text-sm text-gray-600">Set up your sending identity</p>
        </div>
        <div className="text-center p-4">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Target className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Add Contacts</h3>
          <p className="text-sm text-gray-600">Import your homeowner leads</p>
        </div>
        <div className="text-center p-4">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Zap className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Launch Campaign</h3>
          <p className="text-sm text-gray-600">Start sending in minutes</p>
        </div>
      </div>

      <div className="pt-6">
        <Button onClick={onNext} size="lg" className="px-8">
          Start Setup
          <Rocket className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}





























































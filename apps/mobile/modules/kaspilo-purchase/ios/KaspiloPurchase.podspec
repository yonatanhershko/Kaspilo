Pod::Spec.new do |s|
  s.name           = 'KaspiloPurchase'
  s.version        = '1.0.0'
  s.summary        = 'Purchase detection state for Kaspilo'
  s.description    = 'Stores the state the Kaspilo purchase App Intent reads.'
  s.author         = 'Kaspilo'
  s.homepage       = 'https://github.com/yonatanhershko/Kaspilo'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift}'
end

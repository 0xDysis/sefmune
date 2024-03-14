(function() {
const canvas = document.getElementById('shader-canvas');

// Initialize WebGL context
const gl = canvas.getContext('webgl');

// Create the vertex shader
const vertexShaderSource = `
  attribute vec4 a_position;
  void main() {
    gl_Position = a_position;
  }
`;

// Create the fragment shader
const fragmentShaderSource = `
precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform vec2 iMouse;

  

const float Saturation= .9;
const float ColorDensity= 1.4;
const float ColorOffset= 0.1;
const vec3 Color1= vec3(1.,0.9,0.8);
const vec3 Color2= vec3(1.0,0.85,0.65)*.5;
const vec3 Color3= vec3(1.0,0.8,.7)*.4;

#define PI  3.141592

const vec3 lightdir=-vec3(0.0,0.0,1.0);

float colindex;

// Fragmentarium's rotation matrix
mat3 rotmat(vec3 v, float angle)
{
	float c = cos(angle);
	float s = sin(angle);
	
	return mat3(c + (1.0 - c) * v.x * v.x, (1.0 - c) * v.x * v.y - s * v.z, (1.0 - c) * v.x * v.z + s * v.y,
		(1.0 - c) * v.x * v.y + s * v.z, c + (1.0 - c) * v.y * v.y, (1.0 - c) * v.y * v.z - s * v.x,
		(1.0 - c) * v.x * v.z - s * v.y, (1.0 - c) * v.y * v.z + s * v.x, c + (1.0 - c) * v.z * v.z
		);
}

// Random number implementation found at: lumina.sourceforge.net/Tutorials/Noise.html
float rand(vec2 co){
	return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

// Formulas used for texture, coloring and stars
// more info here:
// http://www.fractalforums.com/new-theories-and-research/very-simple-formula-for-fractal-patterns/

float KalisetTexture(vec3 p) {
	vec3 pos=p;
	float l=1.;
	float ln=0.;
	float lnprev=0.;
	float expsmooth=0.;
	for (int i=0; i<13; i++) {
		p.xyz=abs(p.xyz);
		p=p/dot(p,p);
		p=p*2.-vec3(1.);
		if (mod(float(i),2.)>0.) {
			lnprev=ln;
			ln=length(p);
			expsmooth+=exp(-1./abs(lnprev-ln));
		}
	}
	return expsmooth;
}

float KalisetStars(vec3 p) {
	vec3 pos=p;
	float l=1.;
	float ln=0.;
	float lnprev=0.;
	float expsmooth=0.;
	p+=vec3(1.35,1.54,1.23);
	p*=.3;
	for (int i=0; i<18; i++) {
		p.xyz=abs(p.xyz);
		p=p/dot(p,p);
		p=p*1.-vec3(.9);
	}
	return pow(length(p),1.5)*.04;
}


// Distance estimation for sphere with texture displacement
float dsph (in vec4 sph, in vec3 p)
{
	//p*=rotmat(normalize(vec3(0.,1.,0.)),iTime*.05);
	vec3 p2=p-sph.xyz;
	float d=length(p2)-sph.w;
	float tex=KalisetTexture(p2*.4+vec3(.14,.31,.51));
	colindex=tex;
	return d+tex*.006+.25;
}

// Intersection with sphere
float isph (in vec4 sph, in vec3 p, in vec3 rd)
{
	float t=999.,tnow,b,disc;
    vec3 sd=sph.xyz-p;    
    b = dot ( rd,sd );
    disc = b*b + (sph.w*sph.w) - dot ( sd,sd );
    if (disc>0.0) t = b - sqrt(disc);
	return t;
}

// Finite difference normal
vec3 normal(vec4 sph, vec3 p) {
	vec3 e = vec3(0.0,0.01,0.0);
	
	return normalize(vec3(
			dsph(sph,p+e.yxx)-dsph(sph,p-e.yxx),
			dsph(sph,p+e.xyx)-dsph(sph,p-e.xyx),
			dsph(sph,p+e.xxy)-dsph(sph,p-e.xxy)
			)
		);	
}

// AO
float AO(in vec4 sph, in vec3 p, in vec3 n) {
	float ao = 0.0;
	float de = dsph(sph,p);
	float wSum = 0.0;
	float w = 1.0;
    float d = 1.0;
	float aodetail=.02;
	for (float i =1.0; i <6.0; i++) {
		float D = (dsph(sph,p+ d*n*i*i*aodetail) -de)/(d*i*i*aodetail);
		w *= 0.6;
		ao += w*clamp(1.0-D,0.0,1.0);
		wSum += w;
	}
	return clamp(.9*ao/wSum, 0.0, 1.0);
}

// Shadows
float shadow(in vec4 sph, in vec3 p) 
{
	vec3 ldir=-normalize(lightdir);
	float totdist=0., detail=0.01;
	float sh=1.;
	for (int i=0; i<50; i++){;
		float d=dsph(sph,p+totdist*ldir);
		if (d<detail) {sh=0.;continue;}
		if (totdist>sph.w) {sh=1.;continue;}
		totdist+=d*.5;	
	}
	return clamp(sh,0.,1.);
}


// Get gradient from 3-color palette using a coloring index 
vec3 getcolor(float index) {
	float cx=index*ColorDensity+ColorOffset*PI*3.;
	vec3 col;
	float ps=PI/1.5;
	float f1=max(0.,sin(cx));
	float f2=max(0.,sin(cx+ps));
	float f3=max(0.,sin(cx+ps*2.));
	col=mix(Color1,Color2,f1);
	col=mix(col,mix(Color3,Color1,f3),f2);
	col=mix(vec3(length(col)),col,Saturation);
	return col;
}

// Ligthing - diffusse+specular+ambient
vec3 light(in vec4 sph, in vec3 p, in vec3 dir) {
	vec3 ldir=normalize(lightdir);
	vec3 n=normal(sph,p);
	float sh=shadow(sph,p);
	float diff=max(0.,dot(ldir,-n))*sh+.12;
	//diff*=(1.-AO(sph,p,n));
	vec3 r = reflect(ldir,n);
	float spec=max(0.,dot(dir,-r))*sh;
	return vec3(diff*.7+pow(spec,6.)*0.6);	
		}

// Raymarching inside the planet's atmosphere :)
vec3 march(in vec4 sph, in vec3 from, in vec3 dir) 
{
	float totdist=0., detail=0.01;
	vec3 col, p;
	float d;
	for (int i=0; i<200; i++) {
		p=from+totdist*dir;
		d=dsph(sph,p)*.4;
		if (d<detail || totdist>sph.w) break;
		totdist+=d; 
	}
	vec3 back=vec3(1.)*0.5;
	if (d<detail) {
		float cindex=colindex;
		col=getcolor(cindex)*light(sph, p-detail*dir*10., dir); 
	} else { 
		col=vec3(0.);
	}
	return col;
}

// Main code
void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	vec2 mouse=iMouse.xy/iResolution.xy-vec2(.5);
	mat3 camrot1;
	mat3 camrot2;
	float ang=iTime*.15+4.5;
	camrot1=rotmat(vec3(0.,1.,0.),1.+mouse.x*PI*1.5+ang);
	camrot2=rotmat(vec3(1.,0.,0.),1.-mouse.y*PI*1.5);
	mat3 camrot=camrot1*camrot2; // camera rotation
	vec2 uv = fragCoord.xy / iResolution.xy;
	uv=uv*2.-1.;
	uv.y*=iResolution.y/iResolution.x;
	vec3 from=vec3(0.,0.,-8.)*camrot;
	vec3 dir=normalize(vec3(uv*.7,1.))*camrot;
	vec3 col=vec3(0.);
	vec4 sph=vec4(0.,0.,0.,2.8); // sphere position and size 
								 // (I leave the coordinate part for future use)
	float t=isph(sph,from,dir); // intersect with sphere
	if (t<999.) {;
		col=march(sph,from+t*dir,dir); // raymarch a bit from there for the texture
		}
	float dirlen=length(dir.xy);
	vec3 suncol=vec3(1.,.9,.85)*(sign(dir.z)+1.)*.5; //I used sign to eliminate the twin sun
	float occult=min(pow(max(0.,length(from.xy)-sph.w*.92),0.6),.6); // light occulting factor
	float sundisc=-sign(dirlen-.02); // plain sun disc
	float sunbody=pow(smoothstep(.1+occult*.1,0.,dirlen),3.)*1.3; // outside glow
	float rayrad=pow(max(0.,1.-dirlen),4.); // rays length
	float sunrays=0.;
	vec3 rdir=dir*rotmat(vec3(0.,0.,1.),-length(from.xy)*.3);
	for (float s=0.; s<3.; s++){ // get the rays, randomize a bit
		mat3 rayrot=rotmat(vec3(0.,0.,1.),PI/6.+rand(vec2((s+1.)*5.2165485))*.1);
		sunrays+=pow(max(0.,1.-abs(rdir.x)*2.-abs(rdir.y)*.05),100.)
			    *pow(rayrad,.2+rand(vec2((s+1.)*12.215685))*1.5)*.4;
		rdir*=rayrot;
		sunrays+=pow(max(0.,1.-abs(rdir.x)*3.-abs(rdir.y)*.05),150.)
			    *pow(rayrad,.5+rand(vec2((s+1.)*46.243685))*5.)*.3;
		rdir*=rayrot;
	}
	if (col==vec3(0.)) {// hit nothing
		col+=vec3(max(0.,.5*KalisetStars(dir*10.)))*max(0.,1.-sunbody*2.5); //stars
		col+=vec3(.95,.93,1.)*exp(-38.*pow(length(uv),3.5))*3.7 //atmosphere backlight glow
			*pow(max(0.,dot(normalize(lightdir),-dir)),3.);
		//lower the glow and rays when sun is partially hidden
		float sun=min(1.1,sunbody+sunrays*(occult+.2)); 
		sun*=.8+min(.2,occult);
		col+=suncol*max(sundisc,sun); // make sundisk visible when partial hidden
	} else { //hit planet
			col+=suncol*sunrays*occult*.8; // rays over planet, based on hide ammount
			col+=suncol*sunbody*smoothstep(0.435,1.,length(uv))*20.; //tiny bloom effect
	}
	
	fragColor = vec4(col,1.0);
}

  void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
  }
`;

   // Compile the shaders
   const vertexShader = gl.createShader(gl.VERTEX_SHADER);
   gl.shaderSource(vertexShader, vertexShaderSource);
   gl.compileShader(vertexShader);
 
   const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
   gl.shaderSource(fragmentShader, fragmentShaderSource);
   gl.compileShader(fragmentShader);
 
   // Check shader compilation status
   if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
     console.error('Vertex shader compilation failed:', gl.getShaderInfoLog(vertexShader));
     gl.deleteShader(vertexShader);
     return;
   }
 
   if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
     console.error('Fragment shader compilation failed:', gl.getShaderInfoLog(fragmentShader));
     gl.deleteShader(fragmentShader);
     return;
   }
 
   const program = gl.createProgram();
   gl.attachShader(program, vertexShader);
   gl.attachShader(program, fragmentShader);
   gl.linkProgram(program);
 
   // Check the program linking status
   if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
     console.error('Shader program linking failed:', gl.getProgramInfoLog(program));
     gl.deleteProgram(program);
     return;
   }
 
   gl.useProgram(program);
 
   // Set up the vertex buffer
   const positionBuffer = gl.createBuffer();
   gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
   const positions = [
     -1, -1,
     1, -1,
     -1, 1,
     -1, 1,
     1, -1,
     1, 1,
   ];
   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
 
   // Set up the position attribute
   const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
   if (positionAttributeLocation === -1) {
     console.error('Failed to get the attribute location for "a_position"');
     return;
   }
   gl.enableVertexAttribArray(positionAttributeLocation);
   gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
 
   // Get uniform locations
   const timeUniformLocation = gl.getUniformLocation(program, 'iTime');
   const resolutionUniformLocation = gl.getUniformLocation(program, 'iResolution');
   const mouseUniformLocation = gl.getUniformLocation(program, 'iMouse');
 
   if (timeUniformLocation === null || resolutionUniformLocation === null || mouseUniformLocation === null) {
     console.error('Failed to get uniform locations');
     return;
   }
 
   function render() {
     // Set the viewport to match the canvas size
     gl.viewport(0, 0, canvas.width, canvas.height);
 
     // Set the uniform values
     gl.uniform1f(timeUniformLocation, performance.now() / 1000);
     gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
     gl.uniform2f(mouseUniformLocation, 0, 0); // Set default mouse position to (0, 0)
 
     // Draw the shader
     gl.drawArrays(gl.TRIANGLES, 0, 6);
     requestAnimationFrame(render);
   }
 
   // Resize the canvas to match its display size
   function resizeCanvas() {
     const displayWidth = canvas.clientWidth;
     const displayHeight = canvas.clientHeight;
 
     if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
       canvas.width = displayWidth;
       canvas.height = displayHeight;
     }
   }
 
   // Initial canvas resize
   resizeCanvas();
 
   // Resize the canvas on window resize
   window.addEventListener('resize', resizeCanvas);
 
   // Start rendering
   render();
 })();
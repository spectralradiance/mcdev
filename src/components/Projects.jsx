const skills = [
  { category: 'Languages', items: 'Python, JavaScript, TypeScript, C#, HTML, CSS, SQL' },
  { category: 'Frameworks', items: 'Django, Flask, React, Vue, AngularJS, ASP.NET, Bootstrap' },
  { category: 'Databases', items: 'Microsoft SQL, SQLite' },
  { category: 'Platforms & Tools', items: 'WordPress, Webflow, HubSpot, Airtable, Asana, Typeform, Git, Azure, Google Workspace' },
  { category: 'AI / Data', items: 'Neural Networks, Genetic Algorithms, Classification, Clustering, Text Mining' },
];

const Projects = () => {
  return (
    <section className="mb-12">
      <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Skills</h2>
      <div className="space-y-3">
        {skills.map(({ category, items }) => (
          <div key={category} className="flex flex-col sm:flex-row gap-1 sm:gap-4">
            <span className="text-gray-300 font-semibold w-48 shrink-0">{category}</span>
            <span className="text-gray-400">{items}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Projects;
